"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Global error boundary. Users never see raw error details — the message shown
 * is generic, and the real error is logged server-side (docs/SECURITY.md §9).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged to the server console with Next's digest for correlation.
    console.error("Unhandled application error", error.digest);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground text-sm">
        Sorry — we couldn&apos;t load this page. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
