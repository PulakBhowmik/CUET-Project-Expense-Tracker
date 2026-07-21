"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { settleCurrentCycle } from "@/lib/services/settlement";
import { toSafeError } from "@/lib/errors";

export interface SettleActionState {
  error?: string;
  ok?: boolean;
}

export async function settleAction(
  projectId: string,
  idempotencyKey: string,
): Promise<SettleActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  // Basic shape check on the client-supplied idempotency key.
  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 100
  ) {
    return { error: "Invalid settlement request. Please refresh and try again." };
  }

  try {
    await settleCurrentCycle(session.user.id, projectId, idempotencyKey);
  } catch (err) {
    return { error: toSafeError(err).message };
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
