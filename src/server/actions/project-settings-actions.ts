"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  renameProject,
  transferLeadership,
  deleteProject,
} from "@/lib/services/project";
import {
  renameProjectSchema,
  transferLeadershipSchema,
  deleteProjectSchema,
} from "@/lib/validation/project";
import { toSafeError } from "@/lib/errors";

export interface SettingsFormState {
  error?: string;
  ok?: boolean;
}

export async function renameProjectAction(
  projectId: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const parsed = renameProjectSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await renameProject(session.user.id, projectId, parsed.data.name);
  } catch (err) {
    return { error: toSafeError(err).message };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function transferLeadershipAction(
  projectId: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const parsed = transferLeadershipSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await transferLeadership(
      session.user.id,
      projectId,
      parsed.data.targetUserId,
    );
  } catch (err) {
    return { error: toSafeError(err).message };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
  return { ok: true };
}

export async function deleteProjectAction(
  projectId: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const parsed = deleteProjectSchema.safeParse({
    confirmationName: formData.get("confirmationName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await deleteProject(
      session.user.id,
      projectId,
      parsed.data.confirmationName,
    );
  } catch (err) {
    return { error: toSafeError(err).message };
  }
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
