import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { listProjectsForUser, type ProjectSummary } from "@/lib/services/project";

// Pending invitations arrive in Phase 4.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const projects = await listProjectsForUser(session.user.id);
  const created = projects.filter((p) => p.isCreator);
  const memberOnly = projects.filter((p) => !p.isCreator);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {session.user.email ?? session.user.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/projects/new">New project</Link>
          </Button>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </div>

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
