"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { inviteMemberSchema } from "@/lib/validation/invitation";
import { createInvitation, acceptInvitation } from "@/lib/services/invitation";
import { toSafeError } from "@/lib/errors";

export interface CreateInvitationActionState {
  error?: string;
  inviteToken?: string;
  invitedEmail?: string;
}

/** Bind projectId first: createInvitationAction.bind(null, projectId). */
export async function createInvitationAction(
  projectId: string,
  _prevState: CreateInvitationActionState,
  formData: FormData,
): Promise<CreateInvitationActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }

  const parsed = inviteMemberSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const { plaintextToken, invitation } = await createInvitation(
      session.user.id,
      projectId,
      parsed.data.email,
    );
    revalidatePath(`/projects/${projectId}`);
    return { inviteToken: plaintextToken, invitedEmail: invitation.email };
  } catch (err) {
    return { error: toSafeError(err).message };
  }
}

export interface AcceptInvitationActionState {
  error?: string;
}

export async function acceptInvitationAction(
  token: string,
): Promise<AcceptInvitationActionState> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return { error: "You must be signed in." };
  }

  // redirect() throws internally, so it must run outside try/catch.
  let projectId: string;
  try {
    const result = await acceptInvitation(
      session.user.id,
      session.user.email,
      token,
    );
    projectId = result.projectId;
  } catch (err) {
    return { error: toSafeError(err).message };
  }

  redirect(`/projects/${projectId}`);
}
