/**
 * Settlement service. Settling the current cycle is the app's most safety-
 * critical operation, so it runs as one interactive transaction (single
 * connection) with a row lock on the project. See docs/PRD.md "Settlement".
 *
 * Concurrency & idempotency:
 *   - `SELECT ... FOR UPDATE` on the project row serializes concurrent
 *     settlements: the second waits for the first to commit, then finds no
 *     unsettled expenses and is rejected — the same expense can never be
 *     settled twice.
 *   - An idempotency key (unique per (project, key)) makes a retried request
 *     return the existing settlement instead of creating a duplicate.
 */
import { prisma } from "@/lib/db";
import {
  loadProjectContext,
  assertLeaderPower,
} from "@/lib/policy/project-policy";
import { computeCycleBalances } from "@/lib/calc";
import { ConflictError } from "@/lib/errors";
import type { Settlement, SettlementBalance } from "@/generated/prisma/client";

export async function settleCurrentCycle(
  actorUserId: string,
  projectId: string,
  idempotencyKey: string,
): Promise<Settlement> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertLeaderPower(ctx);

  return prisma.$transaction(
    async (tx) => {
      // Serialize concurrent settlements for this project.
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;

      // Idempotent replay: same key returns the settlement already created.
      const existing = await tx.settlement.findUnique({
        where: {
          uniq_project_idempotency: { projectId, idempotencyKey },
        },
      });
      if (existing) return existing;

      const [activeMembers, unsettled] = await Promise.all([
        tx.projectMember.findMany({
          where: { projectId, status: "ACTIVE" },
          select: { userId: true },
        }),
        tx.expense.groupBy({
          by: ["payerUserId"],
          where: { projectId, settlementId: null },
          _sum: { amountPaisa: true },
        }),
      ]);

      const unsettledTotal = unsettled.reduce(
        (acc, r) => acc + (r._sum.amountPaisa ?? 0n),
        0n,
      );
      if (unsettledTotal === 0n) {
        throw new ConflictError("There are no expenses to settle.");
      }

      const paidByUser = new Map<string, bigint>();
      for (const row of unsettled) {
        paidByUser.set(row.payerUserId, row._sum.amountPaisa ?? 0n);
      }

      const cycle = computeCycleBalances(
        activeMembers.map((m) => ({
          userId: m.userId,
          paidPaisa: paidByUser.get(m.userId) ?? 0n,
        })),
      );

      const settlement = await tx.settlement.create({
        data: {
          projectId,
          status: "COMPLETE",
          idempotencyKey,
          cycleTotalPaisa: cycle.cycleTotalPaisa,
          activeMemberCount: cycle.activeMemberCount,
          equalSharePaisa: cycle.baseSharePaisa,
          createdByUserId: actorUserId,
          completedAt: new Date(),
        },
      });

      await tx.settlementBalance.createMany({
        data: cycle.balances.map((b) => ({
          settlementId: settlement.id,
          userId: b.userId,
          paidPaisa: b.paidPaisa,
          sharePaisa: b.sharePaisa,
          netBalancePaisa: b.netBalancePaisa,
        })),
      });

      // Attach ONLY expenses that are still unsettled (defensive: the FOR UPDATE
      // lock already guarantees this, but the condition makes double-settle
      // impossible even if the lock strategy ever changes).
      await tx.expense.updateMany({
        where: { projectId, settlementId: null },
        data: { settlementId: settlement.id },
      });

      await tx.auditLog.create({
        data: {
          projectId,
          actorUserId,
          action: "SETTLEMENT_COMPLETED",
          targetType: "Settlement",
          targetId: settlement.id,
          metadata: {
            cycleTotalPaisa: cycle.cycleTotalPaisa.toString(),
            activeMemberCount: cycle.activeMemberCount,
          },
        },
      });

      return settlement;
    },
    // Generous timeouts: a concurrent settlement waits on the row lock rather
    // than failing fast, so the loser gets a clean "nothing to settle" instead
    // of a transaction timeout.
    { timeout: 20_000, maxWait: 15_000 },
  );
}

export interface SettlementBalanceRow extends SettlementBalance {
  name: string | null;
  email: string;
}

export interface SettlementSummary {
  id: string;
  cycleTotalPaisa: bigint;
  activeMemberCount: number;
  equalSharePaisa: bigint;
  completedAt: Date | null;
  createdAt: Date;
  balances: SettlementBalanceRow[];
}

/** Settlement history for a project the user is a member of, newest first. */
export async function listSettlements(
  actorUserId: string,
  projectId: string,
): Promise<SettlementSummary[]> {
  await loadProjectContext(actorUserId, projectId); // membership gate

  const settlements = await prisma.settlement.findMany({
    where: { projectId, status: "COMPLETE" },
    orderBy: { createdAt: "desc" },
    include: { balances: true },
  });

  // Resolve member display names for the snapshots.
  const userIds = [
    ...new Set(settlements.flatMap((s) => s.balances.map((b) => b.userId))),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return settlements.map((s) => ({
    id: s.id,
    cycleTotalPaisa: s.cycleTotalPaisa,
    activeMemberCount: s.activeMemberCount,
    equalSharePaisa: s.equalSharePaisa,
    completedAt: s.completedAt,
    createdAt: s.createdAt,
    balances: s.balances.map((b) => ({
      ...b,
      name: userMap.get(b.userId)?.name ?? null,
      email: userMap.get(b.userId)?.email ?? "unknown",
    })),
  }));
}
