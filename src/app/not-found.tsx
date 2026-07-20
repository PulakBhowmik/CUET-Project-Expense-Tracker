import Link from "next/link";
import { Button } from "@/components/ui/button";

// Deliberately vague: used both for pages that truly don't exist and for
// projects a user isn't a member of, so existence is never leaked (IDOR
// hardening — see docs/AUTHORIZATION.md §4).
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </main>
  );
}
