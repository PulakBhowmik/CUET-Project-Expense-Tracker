"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  createExpenseSchema,
  updateExpenseSchema,
} from "@/lib/validation/expense";
import {
  createExpense,
  updateExpense,
  deleteExpense,
} from "@/lib/services/expense";
import { toSafeError } from "@/lib/errors";

export interface ExpenseFormState {
  error?: string;
  ok?: boolean;
}

function parseForm(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    amountPaisa: formData.get("amount"),
    expenseDate: formData.get("expenseDate"),
  };
}

export async function createExpenseAction(
  projectId: string,
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const parsed = createExpenseSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await createExpense(session.user.id, projectId, parsed.data);
  } catch (err) {
    return { error: toSafeError(err).message };
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function updateExpenseAction(
  projectId: string,
  expenseId: string,
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const parsed = updateExpenseSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await updateExpense(session.user.id, projectId, expenseId, parsed.data);
  } catch (err) {
    return { error: toSafeError(err).message };
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteExpenseAction(
  projectId: string,
  expenseId: string,
): Promise<ExpenseFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  try {
    await deleteExpense(session.user.id, projectId, expenseId);
  } catch (err) {
    return { error: toSafeError(err).message };
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
