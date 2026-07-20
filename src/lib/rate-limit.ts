/**
 * Best-effort rate limiting (port + in-memory adapter — see
 * docs/ARCHITECTURE.md §9). On serverless (Vercel), in-memory state is
 * per-instance, not globally shared across every request, so this is
 * defense-in-depth alongside database constraints (e.g. the partial-unique
 * pending-invitation index) — not the sole protection. See docs/SECURITY.md
 * §6. Swap for Upstash/Redis behind the same `RateLimiter` interface if a
 * stronger, globally-consistent guarantee is ever needed.
 */
import { getEnv } from "@/lib/env";

export interface RateLimiter {
  consume(key: string): { allowed: boolean; retryAfterMs?: number };
}

export function createInMemoryRateLimiter(opts: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    consume(key: string) {
      const now = Date.now();
      const windowStart = now - opts.windowMs;
      const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
      if (timestamps.length >= opts.limit) {
        return {
          allowed: false,
          retryAfterMs: timestamps[0] + opts.windowMs - now,
        };
      }
      timestamps.push(now);
      hits.set(key, timestamps);
      return { allowed: true };
    },
  };
}

let inviteLimiter: RateLimiter | null = null;
let acceptLimiter: RateLimiter | null = null;

export function getInviteRateLimiter(): RateLimiter {
  if (!inviteLimiter) {
    inviteLimiter = createInMemoryRateLimiter({
      limit: getEnv().RATE_LIMIT_INVITES_PER_MIN,
      windowMs: 60_000,
    });
  }
  return inviteLimiter;
}

export function getAcceptRateLimiter(): RateLimiter {
  if (!acceptLimiter) {
    acceptLimiter = createInMemoryRateLimiter({
      limit: getEnv().RATE_LIMIT_ACCEPT_PER_MIN,
      windowMs: 60_000,
    });
  }
  return acceptLimiter;
}
