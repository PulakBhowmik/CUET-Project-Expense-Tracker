/**
 * Integration tests against the REAL configured database.
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/services/project";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
} from "@/lib/services/expense";
import { getProjectBalances } from "@/lib/services/balances";
import { AuthorizationError, ConflictError, NotFoundError } from "@/lib/errors";
import { createTestUser } from "../factories";

describe("expense CRUD & authorization (integration)", () => {
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
    const p = await createProject(creatorId, { name: "Expense Test" });
    createdProjectIds.push(p.id);
    return p;
  }
  async function addMember(projectId: string, userId: string) {
    await prisma.projectMember.create({ data: { projectId, userId } });
  }
  const anExpense = () => ({
    title: "Printing",
    description: null,
    amountPaisa: 5000n,
    expenseDate: new Date("2026-07-20"),
  });

  it("[required test #8] a member can add an expense (for themselves only)", async () => {
    const leader = await user();
    const p = await project(leader.id);

    const expense = await createExpense(leader.id, p.id, anExpense());
    expect(expense.payerUserId).toBe(leader.id);
    expect(expense.amountPaisa).toBe(5000n);
    expect(expense.settlementId).toBeNull();
  });

  it("a non-member cannot add an expense (404, no existence leak)", async () => {
    const leader = await user();
    const outsider = await user();
    const p = await project(leader.id);

    await expect(
      createExpense(outsider.id, p.id, anExpense()),
    ).rejects.toThrow(NotFoundError);
  });

  it("[required test #9] the owner can edit their own unsettled expense", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const expense = await createExpense(owner.id, p.id, anExpense());

    const updated = await updateExpense(owner.id, p.id, expense.id, {
      title: "Printing (revised)",
      description: "extra pages",
      amountPaisa: 7500n,
      expenseDate: new Date("2026-07-21"),
    });
    expect(updated.title).toBe("Printing (revised)");
    expect(updated.amountPaisa).toBe(7500n);
    // Payer is never changed by an edit.
    expect(updated.payerUserId).toBe(owner.id);
  });

  it("[required test #10] another member CANNOT edit someone else's expense", async () => {
    const owner = await user();
    const other = await user();
    const p = await project(owner.id);
    await addMember(p.id, other.id);
    const expense = await createExpense(owner.id, p.id, anExpense());

    await expect(
      updateExpense(other.id, p.id, expense.id, {
        title: "hijacked",
        description: null,
        amountPaisa: 1n,
        expenseDate: new Date("2026-07-21"),
      }),
    ).rejects.toThrow(AuthorizationError);

    // The expense is unchanged.
    const unchanged = await prisma.expense.findUnique({
      where: { id: expense.id },
    });
    expect(unchanged?.title).toBe("Printing");
    expect(unchanged?.amountPaisa).toBe(5000n);
  });

  it("[required test #11] the LEADER cannot edit another member's expense either", async () => {
    const leader = await user();
    const member = await user();
    const p = await project(leader.id); // leader is creator+leader
    await addMember(p.id, member.id);
    const memberExpense = await createExpense(member.id, p.id, anExpense());

    await expect(
      updateExpense(leader.id, p.id, memberExpense.id, {
        title: "leader override",
        description: null,
        amountPaisa: 1n,
        expenseDate: new Date("2026-07-21"),
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("a member can delete only their own unsettled expense", async () => {
    const owner = await user();
    const other = await user();
    const p = await project(owner.id);
    await addMember(p.id, other.id);
    const expense = await createExpense(owner.id, p.id, anExpense());

    await expect(deleteExpense(other.id, p.id, expense.id)).rejects.toThrow(
      AuthorizationError,
    );

    await deleteExpense(owner.id, p.id, expense.id);
    const gone = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(gone).toBeNull();
  });

  it("a settled expense is locked: nobody can edit or delete it", async () => {
    const owner = await user();
    const p = await project(owner.id);
    const expense = await createExpense(owner.id, p.id, anExpense());

    // Simulate settlement by attaching the expense to a completed settlement.
    const settlement = await prisma.settlement.create({
      data: {
        projectId: p.id,
        status: "COMPLETE",
        idempotencyKey: "test-key",
        cycleTotalPaisa: 5000n,
        activeMemberCount: 1,
        equalSharePaisa: 5000n,
        createdByUserId: owner.id,
        completedAt: new Date(),
      },
    });
    await prisma.expense.update({
      where: { id: expense.id },
      data: { settlementId: settlement.id },
    });

    await expect(
      updateExpense(owner.id, p.id, expense.id, {
        title: "changed after settle",
        description: null,
        amountPaisa: 9999n,
        expenseDate: new Date("2026-07-21"),
      }),
    ).rejects.toThrow(ConflictError);

    await expect(deleteExpense(owner.id, p.id, expense.id)).rejects.toThrow(
      ConflictError,
    );
  });

  it("balances: 4 members, one pays ৳100 -> payer +৳75, others owe ৳25 each", async () => {
    const a = await user();
    const b = await user();
    const c = await user();
    const d = await user();
    const p = await project(a.id);
    await addMember(p.id, b.id);
    await addMember(p.id, c.id);
    await addMember(p.id, d.id);

    await createExpense(a.id, p.id, {
      title: "Everything",
      description: null,
      amountPaisa: 10000n,
      expenseDate: new Date("2026-07-20"),
    });

    const balances = await getProjectBalances(a.id, p.id);
    expect(balances.cycle.cycleTotalPaisa).toBe(10000n);
    expect(balances.lifetimeTotalPaisa).toBe(10000n);

    const byUser = Object.fromEntries(
      balances.cycle.balances.map((x) => [x.userId, x.netBalancePaisa]),
    );
    expect(byUser[a.id]).toBe(7500n); // should receive ৳75
    expect(byUser[b.id]).toBe(-2500n); // owes ৳25
    expect(byUser[c.id]).toBe(-2500n);
    expect(byUser[d.id]).toBe(-2500n);
  });

  it("lifetime total includes settled expenses; current cycle excludes them", async () => {
    const owner = await user();
    const p = await project(owner.id);

    // One settled expense (attached to a completed settlement).
    const settled = await createExpense(owner.id, p.id, {
      title: "Old",
      description: null,
      amountPaisa: 3000n,
      expenseDate: new Date("2026-07-10"),
    });
    const settlement = await prisma.settlement.create({
      data: {
        projectId: p.id,
        status: "COMPLETE",
        idempotencyKey: "k1",
        cycleTotalPaisa: 3000n,
        activeMemberCount: 1,
        equalSharePaisa: 3000n,
        createdByUserId: owner.id,
        completedAt: new Date(),
      },
    });
    await prisma.expense.update({
      where: { id: settled.id },
      data: { settlementId: settlement.id },
    });

    // One current (unsettled) expense.
    await createExpense(owner.id, p.id, {
      title: "New",
      description: null,
      amountPaisa: 2000n,
      expenseDate: new Date("2026-07-21"),
    });

    const balances = await getProjectBalances(owner.id, p.id);
    expect(balances.lifetimeTotalPaisa).toBe(5000n); // 3000 + 2000
    expect(balances.cycle.cycleTotalPaisa).toBe(2000n); // only unsettled

    // The listing shows both, flagged correctly.
    const rows = await listExpenses(owner.id, p.id);
    expect(rows.find((r) => r.title === "Old")?.settled).toBe(true);
    expect(rows.find((r) => r.title === "New")?.settled).toBe(false);
    expect(rows.find((r) => r.title === "Old")?.canModify).toBe(false);
    expect(rows.find((r) => r.title === "New")?.canModify).toBe(true);
  });
});
