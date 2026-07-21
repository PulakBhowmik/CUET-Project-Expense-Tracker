import Link from "next/link";
import { getSession } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * Persistent top navigation. Rendered in the root layout so every page has a
 * consistent way back to the dashboard and a visible sign-out.
 */
export async function SiteHeader() {
  const session = await getSession();
  const user = session?.user;

  return (
    <header className="bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur-sm">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6"
      >
        <Link
          href={user ? "/dashboard" : "/"}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-xs font-bold"
          >
            ৳
          </span>
          <span className="hidden sm:inline">CUET Expense Splitter</span>
          <span className="sm:hidden">Expenses</span>
        </Link>

        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/projects/new">New project</Link>
            </Button>
            <span
              className="text-muted-foreground hidden max-w-[16ch] truncate text-xs lg:inline"
              title={user.email ?? undefined}
            >
              {user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </nav>
    </header>
  );
}
