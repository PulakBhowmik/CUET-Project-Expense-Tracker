"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createProjectSchema } from "@/lib/validation/project";
import { createProject } from "@/lib/services/project";
import { toSafeError } from "@/lib/errors";

export interface CreateProjectActionState {
  error?: string;
}

export async function createProjectAction(
  _prevState: CreateProjectActionState,
  formData: FormData,
): Promise<CreateProjectActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }

  const parsed = createProjectSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // `redirect()` throws internally, so it must run outside try/catch —
  // otherwise this catch block would swallow the redirect.
  let projectId: string;
  try {
    const project = await createProject(session.user.id, parsed.data);
    projectId = project.id;
  } catch (err) {
    return { error: toSafeError(err).message };
  }

  redirect(`/projects/${projectId}`);
}
