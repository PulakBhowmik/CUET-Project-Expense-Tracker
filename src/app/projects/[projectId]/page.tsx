import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/services/project";
import { NotFoundError } from "@/lib/errors";
import { InviteMemberForm } from "@/components/projects/invite-member-form";
import { PendingInvitationsList } from "@/components/projects/pending-invitations-list";

// Expenses, balances, realtime sync, and settlement land in later phases.
// This page proves membership-gated access: non-members and nonexistent
// project ids both resolve to the same 404 (see docs/AUTHORIZATION.md §4).
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { projectId } = await params;

  let detail;
  try {
    detail = await getProjectForUser(session.user.id, projectId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }

  const { project, members, isLeader, isCreator } = detail;
  const leader = members.find((m) => m.id === project.leaderMemberId);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Leader: {leader?.name ?? leader?.email ?? "Unknown"}
          {isLeader && " (you)"}
          {isCreator && !isLeader && " · you created this project"}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Members ({members.length})</h2>
        <ul className="divide-y rounded-lg border">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between p-3 text-sm"
            >
              <span>{m.name ?? m.email}</span>
              {m.id === project.leaderMemberId && (
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                  Leader
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {(isLeader || isCreator) && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Invite a member</h2>
          <InviteMemberForm projectId={project.id} />
          <PendingInvitationsList
            actorUserId={session.user.id}
            projectId={project.id}
          />
        </section>
      )}

      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        Expenses, balances, and settlement history arrive in upcoming phases.
      </div>
    </main>
  );
}
