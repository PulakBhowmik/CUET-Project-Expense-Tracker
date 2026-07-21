"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the page fresh for everyone currently viewing it.
 *
 * Deliberately simple: instead of websockets + row-level-security, we re-run
 * the server components on a timer via `router.refresh()`. Every refresh goes
 * through the normal authorized server path, so totals and balances are always
 * re-fetched authoritatively — the client never computes money itself and no
 * private data is broadcast to anyone.
 *
 * Polling pauses while the tab is hidden and resumes (with an immediate
 * refresh) when it becomes visible again, which also covers reconnection.
 */
export function LiveRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // These setState calls run from timers/events, never during the effect
    // body, so they don't cause render-phase updates.
    function sync() {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      router.refresh();
      setLastSync(new Date());
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") sync();
    }
    function handleOnline() {
      setOnline(true);
      sync();
    }
    function handleOffline() {
      setOnline(false);
    }

    const id = setInterval(sync, intervalMs);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router, intervalMs]);

  return (
    <p
      className="text-muted-foreground flex items-center gap-1.5 text-xs"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={`inline-block size-2 rounded-full ${
          online ? "animate-pulse bg-emerald-500" : "bg-muted-foreground"
        }`}
      />
      {online ? "Live" : "Offline"}
      {lastSync && online && (
        <span className="hidden sm:inline">
          · updated {lastSync.toLocaleTimeString()}
        </span>
      )}
    </p>
  );
}
