import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getProjectForUser } from "@/lib/services/project";
import { NotFoundError } from "@/lib/errors";
import {
  RenameProjectForm,
  TransferLeadershipForm,
  DeleteProjectForm,
} from "@/components/projects/project-settings-forms";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { projectId } = await params;

  let detail;
  try {
    detail = await getProjectForUser(userId, projectId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const { project, members, isLeader, isCreator } = detail;

  // Ordinary members have no settings to manage — the server is the authority,
  // but we also avoid showing controls that would only fail.
  if (!isLeader && !isCreator) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Only the project leader can manage this project&apos;s settings.
        </p>
        <Link
          href={`/projects/${projectId}`}
          className="text-primary text-sm underline"
        >
          ← Back to project
        </Link>
      </main>
    );
  }

  const transferOptions = members
    .filter((m) => m.id !== project.leaderMemberId)
    .map((m) => ({ userId: m.userId, label: m.name ?? m.email }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Back to {project.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      {isLeader && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Rename project</h2>
          <RenameProjectForm projectId={projectId} currentName={project.name} />
        </section>
      )}

      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="text-lg font-medium">Transfer leadership</h2>
          <p className="text-muted-foreground text-sm">
            Hand the leader role to another active member. This is recorded in
            the audit log.
          </p>
        </div>
        <TransferLeadershipForm
          projectId={projectId}
          options={transferOptions}
        />
      </section>

      {isLeader && (
        <section className="border-destructive/40 space-y-4 rounded-lg border p-4">
          <h2 className="text-destructive text-lg font-medium">Danger zone</h2>
          <DeleteProjectForm projectId={projectId} projectName={project.name} />
        </section>
      )}
    </main>
  );
}
