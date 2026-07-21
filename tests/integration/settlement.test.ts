/**
 * Integration tests against the REAL configured database.
 * Covers the settlement transaction: snapshot, cycle reset, lifetime
 * preservation, idempotency, and concurrency safety.
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/services/project";
import { createExpense } from "@/lib/services/expense";
import { getProjectBalances } from "@/lib/services/balances";
import {
  settleCurrentCycle,
  listSettlements,
} from "@/lib/services/settlement";
import { AuthorizationError, ConflictError } from "@/lib/errors";
import { createTestUser } from "../factories";

describe("settlement (integration)", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  afterEach(async () => {
    for (const id of createdProjectIds.splice(0)) {
      await prisma.project.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUserIds.splice(0)) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  async function user() {
    const u = await createTestUser();
    createdUserIds.push(u.id);
    return u;
  }
  async function project(creatorId: string) {
    const p = await createProject(creatorId, { name: "Settlement Test" });
    createdProjectIds.push(p.id);
    return p;
  }
  async function addMember(projectId: string, userId: string) {
    await prisma.projectMember.create({ data: { projectId, userId } });
  }
  function expense(amountPaisa: bigint, title = "Item") {
    return {
      title,
      description: null,
      amountPaisa,
      expenseDate: new Date("2026-07-20"),
    };
  }

  it("snapshots the correct balances (4 members, one pays ৳100)", async () => {
    const a = await user();
    const b = await user();
    const c = await user();
    const d = await user();
    const p = await project(a.id);
    await addMember(p.id, b.id);
    await addMember(p.id, c.id);
    await addMember(p.id, d.id);
    await createExpense(a.id, p.id, expense(10000n));

    const settlement = await settleCurrentCycle(a.id, p.id, "key-1");

    expect(settlement.cycleTotalPaisa).toBe(10000n);
    expect(settlement.activeMemberCount).toBe(4);
    expect(settlement.equalSharePaisa).toBe(2500n);
    expect(settlement.status).toBe("COMPLETE");
    expect(settlement.completedAt).not.toBeNull();

    const balances = await prisma.settlementBalance.findMany({
      where: { settlementId: settlement.id },
    });
    expect(balances).toHaveLength(4);
    const byUser = Object.fromEntries(
      balances.map((x) => [x.userId, x.netBalancePaisa]),
    );
    expect(byUser[a.id]).toBe(7500n); // payer should receive ৳75
    expect(byUser[b.id]).toBe(-2500n);
    expect(byUser[c.id]).toBe(-2500n);
    expect(byUser[d.id]).toBe(-2500n);
    // Snapshot invariant: nets sum to zero.
    expect(balances.reduce((s, x) => s + x.netBalancePaisa, 0n)).toBe(0n);
  });

  it("[required test #15] resets the current cycle after settling", async () => {
    const a = await user();
    const b = await user();
    const p = await project(a.id);
    await addMember(p.id, b.id);
    await createExpense(a.id, p.id, expense(10000n));

    const before = await getProjectBalances(a.id, p.id);
    expect(before.cycle.cycleTotalPaisa).toBe(10000n);

    await settleCurrentCycle(a.id, p.id, "key-reset");

    const after = await getProjectBalances(a.id, p.id);
    expect(after.cycle.cycleTotalPaisa).toBe(0n);
    expect(after.cycle.balances.every((x) => x.netBalancePaisa === 0n)).toBe(
      true,
    );
  });

  it("[required test #16] preserves the lifetime total and history", async () => {
    const a = await user();
    const p = await project(a.id);
    await createExpense(a.id, p.id, expense(10000n));

    await settleCurrentCycle(a.id, p.id, "key-lifetime");

    const after = await getProjectBalances(a.id, p.id);
    expect(after.lifetimeTotalPaisa).toBe(10000n); // never resets
    expect(after.cycle.cycleTotalPaisa).toBe(0n);

    const history = await listSettlements(a.id, p.id);
    expect(history).toHaveLength(1);
    expect(history[0].cycleTotalPaisa).toBe(10000n);
    expect(history[0].balances).toHaveLength(1);
  });

  it("new expenses after settling belong to a fresh cycle", async () => {
    const a = await user();
    const p = await project(a.id);
    await createExpense(a.id, p.id, expense(10000n, "Old"));
    await settleCurrentCycle(a.id, p.id, "key-cycle");

    await createExpense(a.id, p.id, expense(2500n, "New"));

    const after = await getProjectBalances(a.id, p.id);
    expect(after.cycle.cycleTotalPaisa).toBe(2500n); // only the new one
    expect(after.lifetimeTotalPaisa).toBe(12500n); // both
  });

  it("[required test #18] the same idempotency key never creates a duplicate", async () => {
    const a = await user();
    const p = await project(a.id);
    await createExpense(a.id, p.id, expense(10000n));

    const first = await settleCurrentCycle(a.id, p.id, "same-key");
    const second = await settleCurrentCycle(a.id, p.id, "same-key");

    expect(second.id).toBe(first.id); // idempotent replay
    const count = await prisma.settlement.count({ where: { projectId: p.id } });
    expect(count).toBe(1);
  });

  it("[required test #19] concurrent settlements never settle the same expense twice", async () => {
    const a = await user();
    const b = await user();
    const p = await project(a.id);
    await addMember(p.id, b.id);
    await createExpense(a.id, p.id, expense(10000n));

    // Two different keys fired simultaneously: the row lock serializes them,
    // and the loser finds nothing left to settle.
    const results = await Promise.allSettled([
      settleCurrentCycle(a.id, p.id, "race-A"),
      settleCurrentCycle(a.id, p.id, "race-B"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    // Exactly one settlement, and every expense points at it exactly once.
    const settlements = await prisma.settlement.findMany({
      where: { projectId: p.id },
    });
    expect(settlements).toHaveLength(1);

    const expenses = await prisma.expense.findMany({
      where: { projectId: p.id },
    });
    expect(expenses.every((e) => e.settlementId === settlements[0].id)).toBe(
      true,
    );

    // And the snapshot wasn't duplicated.
    const balances = await prisma.settlementBalance.findMany({
      where: { settlementId: settlements[0].id },
    });
    expect(balances).toHaveLength(2);
  });

  it("rejects settling when there is nothing unsettled", async () => {
    const a = await user();
    const p = await project(a.id);

    await expect(
      settleCurrentCycle(a.id, p.id, "empty-key"),
    ).rejects.toThrow(ConflictError);
  });

  it("an ordinary member cannot settle the cycle", async () => {
    const leader = await user();
    const member = await user();
    const p = await project(leader.id);
    await addMember(p.id, member.id);
    await createExpense(member.id, p.id, expense(5000n));

    await expect(
      settleCurrentCycle(member.id, p.id, "member-key"),
    ).rejects.toThrow(AuthorizationError);
  });

  it("distributes remainder paisa deterministically in the snapshot", async () => {
    // 100 paisa split 3 ways -> 34/33/33 by ascending userId.
    const a = await user();
    const b = await user();
    const c = await user();
    const p = await project(a.id);
    await addMember(p.id, b.id);
    await addMember(p.id, c.id);
    await createExpense(a.id, p.id, expense(100n));

    const settlement = await settleCurrentCycle(a.id, p.id, "remainder-key");
    const balances = await prisma.settlementBalance.findMany({
      where: { settlementId: settlement.id },
      orderBy: { userId: "asc" },
    });

    expect(balances.map((x) => x.sharePaisa)).toEqual([34n, 33n, 33n]);
    expect(balances.reduce((s, x) => s + x.sharePaisa, 0n)).toBe(100n);
    expect(balances.reduce((s, x) => s + x.netBalancePaisa, 0n)).toBe(0n);
  });
});
