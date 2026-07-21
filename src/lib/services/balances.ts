/**
 * Authoritative project totals & balances, computed from the database (no
 * mutable denormalized totals — docs/DATABASE.md §5).
 *
 *   - lifetimeTotalPaisa: sum of ALL expenses (settled + unsettled); never resets.
 *   - cycle: equal-split balances over the CURRENT (unsettled) cycle only.
 */
import { prisma } from "@/lib/db";
import {
  loadProjectContext,
  getActiveMembers,
  assertMember,
} from "@/lib/policy/project-policy";
import { computeCycleBalances, type CycleBalances } from "@/lib/calc";

export interface ProjectBalances {
  lifetimeTotalPaisa: bigint;
  cycle: CycleBalances;
  /** Per active member, keyed for display alongside cycle.balances. */
  memberNames: Record<string, { name: string | null; email: string }>;
}

export async function getProjectBalances(
  actorUserId: string,
  projectId: string,
): Promise<ProjectBalances> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertMember(ctx);

  const [activeMembers, unsettledByPayer, lifetimeAgg] = await Promise.all([
    getActiveMembers(projectId),
    prisma.expense.groupBy({
      by: ["payerUserId"],
      where: { projectId, settlementId: null },
      _sum: { amountPaisa: true },
    }),
    prisma.expense.aggregate({
      where: { projectId },
      _sum: { amountPaisa: true },
    }),
  ]);

  const paidByUser = new Map<string, bigint>();
  for (const row of unsettledByPayer) {
    paidByUser.set(row.payerUserId, row._sum.amountPaisa ?? 0n);
  }

  const cycle = computeCycleBalances(
    activeMembers.map((m) => ({
      userId: m.userId,
      paidPaisa: paidByUser.get(m.userId) ?? 0n,
    })),
  );

  const memberNames: ProjectBalances["memberNames"] = {};
  for (const m of activeMembers) {
    memberNames[m.userId] = { name: m.user.name, email: m.user.email };
  }

  return {
    lifetimeTotalPaisa: lifetimeAgg._sum.amountPaisa ?? 0n,
    cycle,
    memberNames,
  };
}
