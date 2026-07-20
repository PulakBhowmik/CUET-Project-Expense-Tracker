import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

// Full dashboard content (projects, invitations, create button) lands in
// Phase 3; this shell proves the auth gate end-to-end and gives signed-in
// users a landing page.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {session.user.email ?? session.user.name}
          </p>
        </div>
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

      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        Projects, invitations, and the create-project button arrive in the
        next phase.
      </div>
    </main>
  );
}
