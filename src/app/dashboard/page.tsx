import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import {
  listProjectsForUser,
  type ProjectSummary,
} from "@/lib/services/project";
import { listInvitationsForUser } from "@/lib/services/invitation";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const [projects, invitations] = await Promise.all([
    listProjectsForUser(session.user.id),
    listInvitationsForUser(session.user.email),
  ]);
  const created = projects.filter((p) => p.isCreator);
  const memberOnly = projects.filter((p) => !p.isCreator);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Signed in as {session.user.email ?? session.user.name}
        </p>
      </div>

      {invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Pending invitations</h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-lg border p-4 text-sm"
              >
                <span>
                  You&apos;ve been invited to <strong>{inv.projectName}</strong>
                </span>
                <span className="text-muted-foreground text-xs">
                  Ask the leader for your invite link
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProjectSection
        title="Your projects"
        projects={created}
        emptyText="You haven't created a project yet."
      />
      <ProjectSection
        title="Projects you're a member of"
        projects={memberOnly}
        emptyText="You're not a member of any other projects yet."
      />
    </main>
  );
}

function ProjectSection({
  title,
  projects,
  emptyText,
}: {
  title: string;
  projects: ProjectSummary[];
  emptyText: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {projects.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {emptyText}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map(({ project, memberCount, isLeader }) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="hover:bg-accent block rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{project.name}</span>
                  {isLeader && (
                    <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                      Leader
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {memberCount} member{memberCount === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
