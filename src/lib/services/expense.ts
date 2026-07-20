/**
 * Expense service. Key invariants (docs/PRD.md §5.4, docs/AUTHORIZATION.md):
 *   - A member creates expenses only for THEMSELVES: `payerUserId` is taken
 *     from the authenticated context, never from client input, and is
 *     immutable afterward (no update path writes it).
 *   - Only the payer may edit/delete, and only while the expense is unsettled.
 *   - Settled expenses are locked for everyone.
 */
import { prisma } from "@/lib/db";
import {
  loadProjectContext,
  assertMember,
  assertCanModifyExpense,
} from "@/lib/policy/project-policy";
import { NotFoundError } from "@/lib/errors";
import type { Expense } from "@/generated/prisma/client";

export interface CreateExpenseData {
  title: string;
  description: string | null;
  amountPaisa: bigint;
  expenseDate: Date;
}

export type UpdateExpenseData = CreateExpenseData;

export async function createExpense(
  actorUserId: string,
  projectId: string,
  data: CreateExpenseData,
): Promise<Expense> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertMember(ctx);

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        projectId,
        payerUserId: actorUserId, // self only — never from client
        title: data.title,
        description: data.description,
        amountPaisa: data.amountPaisa,
        expenseDate: data.expenseDate,
      },
    });
    await tx.auditLog.create({
      data: {
        projectId,
        actorUserId,
        action: "EXPENSE_CREATED",
        targetType: "Expense",
        targetId: expense.id,
        metadata: {
          amountPaisa: expense.amountPaisa.toString(),
          title: expense.title,
        },
      },
    });
    return expense;
  });
}

/** Loads an expense that belongs to a project the user can access, or throws NotFoundError. */
async function loadExpenseInProject(
  actorUserId: string,
  projectId: string,
  expenseId: string,
): Promise<Expense> {
  await loadProjectContext(actorUserId, projectId); // membership gate
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.projectId !== projectId) {
    throw new NotFoundError("Expense not found.");
  }
  return expense;
}

export async function updateExpense(
  actorUserId: string,
  projectId: string,
  expenseId: string,
  data: UpdateExpenseData,
): Promise<Expense> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  const expense = await loadExpenseInProject(actorUserId, projectId, expenseId);
  assertCanModifyExpense(ctx, expense);

  return prisma.$transaction(async (tx) => {
    // Guard against a concurrent settlement between our read and write: only
    // update while still unsettled. `updateMany` returns a count we can check.
    const result = await tx.expense.updateMany({
      where: { id: expenseId, settlementId: null, payerUserId: actorUserId },
      data: {
        title: data.title,
        description: data.description,
        amountPaisa: data.amountPaisa,
        expenseDate: data.expenseDate,
      },
    });
    if (result.count === 0) {
      throw new NotFoundError("Expense not found.");
    }
    await tx.auditLog.create({
      data: {
        projectId,
        actorUserId,
        action: "EXPENSE_UPDATED",
        targetType: "Expense",
        targetId: expenseId,
      },
    });
    const updated = await tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
    });
    return updated;
  });
}

export async function deleteExpense(
  actorUserId: string,
  projectId: string,
  expenseId: string,
): Promise<void> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  const expense = await loadExpenseInProject(actorUserId, projectId, expenseId);
  assertCanModifyExpense(ctx, expense);

  await prisma.$transaction(async (tx) => {
    const result = await tx.expense.deleteMany({
      where: { id: expenseId, settlementId: null, payerUserId: actorUserId },
    });
    if (result.count === 0) {
      throw new NotFoundError("Expense not found.");
    }
    await tx.auditLog.create({
      data: {
        projectId,
        actorUserId,
        action: "EXPENSE_DELETED",
        targetType: "Expense",
        targetId: expenseId,
      },
    });
  });
}

export interface ExpenseRow {
  id: string;
  title: string;
  description: string | null;
  amountPaisa: bigint;
  expenseDate: Date;
  payerUserId: string;
  payerName: string | null;
  payerEmail: string;
  settled: boolean;
  canModify: boolean;
}

/** All expenses for a project the user can access, newest expense-date first. */
export async function listExpenses(
  actorUserId: string,
  projectId: string,
): Promise<ExpenseRow[]> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertMember(ctx);

  const expenses = await prisma.expense.findMany({
    where: { projectId },
    include: { payer: { select: { name: true, email: true } } },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });

  return expenses.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    amountPaisa: e.amountPaisa,
    expenseDate: e.expenseDate,
    payerUserId: e.payerUserId,
    payerName: e.payer.name,
    payerEmail: e.payer.email,
    settled: e.settlementId !== null,
    canModify: e.payerUserId === actorUserId && e.settlementId === null,
  }));
}
