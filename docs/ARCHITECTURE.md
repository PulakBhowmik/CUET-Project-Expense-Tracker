# Architecture — CUET Expense Splitter

## 1. Technology stack

| Concern          | Choice                                                  |
| ---------------- | ------------------------------------------------------- |
| Framework        | Next.js (latest stable) — App Router, Server Components |
| Language         | TypeScript, `strict: true`                              |
| Styling          | Tailwind CSS + shadcn/ui                                |
| Database         | PostgreSQL                                              |
| ORM              | Prisma                                                  |
| Auth             | Auth.js (NextAuth v5) — Google OpenID Connect           |
| Validation       | Zod (shared client/server schemas)                      |
| Realtime         | Supabase Realtime behind a `RealtimeAdapter` port       |
| Unit/Integration | Vitest                                                  |
| E2E              | Playwright                                              |
| Lint/Format      | ESLint + Prettier                                       |
| Local DB         | Docker Compose (PostgreSQL)                             |
| Deployment       | Vercel-compatible                                       |

## 2. Layering (ports & adapters)

```
┌─────────────────────────────────────────────────────────────┐
│ UI (App Router pages, Server + Client Components, shadcn/ui) │
├─────────────────────────────────────────────────────────────┤
│ Server Actions / Route Handlers  (thin: validate → policy →  │
│                                    service → serialize)      │
├─────────────────────────────────────────────────────────────┤
│ Policy layer  (authorization: pure functions, unit-tested)  │
├─────────────────────────────────────────────────────────────┤
│ Service / domain layer                                       │
│   - expense service   - settlement service (transactional)   │
│   - invitation service - project service - calc service      │
├─────────────────────────────────────────────────────────────┤
│ Ports (interfaces):  AuthProvider · RealtimeAdapter ·        │
│                      Clock · RateLimiter · TokenHasher ·     │
│                      EmailDomainPolicy                       │
├─────────────────────────────────────────────────────────────┤
│ Adapters: Prisma repo · Supabase realtime · Google OIDC ·   │
│           system clock · in-memory/redis rate limiter        │
├─────────────────────────────────────────────────────────────┤
│ PostgreSQL (Prisma schema, constraints, indexes)            │
└─────────────────────────────────────────────────────────────┘
```

**Rule:** external services (Google, Supabase, rate-limiter store) are only
reached through a port interface in `src/lib/ports/`, so they can be swapped.

## 3. Key directories

See `IMPLEMENTATION_PLAN.md` §"Directory structure".

## 4. Request flow (mutation)

1. Client calls a **Server Action** (or POSTs a Route Handler).
2. Session resolved via Auth.js (`auth()`), user id from `session.user.id`.
3. Input parsed with a **Zod** schema (reject on failure → safe error).
4. **Policy function** loads membership + role and authorizes the action
   (throws typed `AuthorizationError` → mapped to 403).
5. **Service** performs the domain operation inside a Prisma transaction where
   needed; writes an `AuditLog` row for important changes.
6. On success, emit a realtime signal (via `RealtimeAdapter`) scoped to the
   project channel; clients re-fetch authoritative data.
7. Response serialized with money formatted as needed; **never** leak raw DB
   errors.

## 5. Realtime design

- Channel per project: `project:{projectId}` (server-authorized).
- Supabase Row Level Security ensures a client can only subscribe to rows for
  projects where they have an active membership (policy mirrors app policy).
- Client treats realtime events only as **invalidation signals**; it re-fetches
  authoritative totals/balances from the server (never trusts client math or
  broadcast payloads for money).
- Reconnection: on resubscribe, client re-fetches full state; events carry a
  monotonic `version`/timestamp so duplicates are ignored.
- The `RealtimeAdapter` port allows replacing Supabase with Pusher/Ably/a
  Postgres LISTEN-NOTIFY adapter without touching domain code.

## 6. Configuration & secrets

- All config via environment variables, validated at boot by a Zod schema in
  `src/lib/env.ts` (fail fast). See `SECURITY.md`.
- Server-only secrets never imported into client components; enforced by
  keeping them out of `NEXT_PUBLIC_*` and by an ESLint boundary.

## 7. Error handling

- Typed domain errors: `AuthorizationError`, `NotFoundError`,
  `ValidationError`, `ConflictError`, `RateLimitError`.
- A single mapper converts them to HTTP status + safe user message.
- Unexpected errors → logged server-side with a correlation id; user sees a
  generic message.

## 8. Testing architecture

- **Unit**: calculation service, policy functions, remainder distribution,
  Zod schemas, email-domain policy.
- **Integration** (Vitest + test Postgres): invitations, expense CRUD auth,
  settlement transaction, idempotency & concurrency.
- **E2E** (Playwright): login gating (mocked OIDC), IDOR, realtime update
  between two browser contexts.
- Fixtures/factories in `tests/factories/` build users, projects, memberships,
  expenses with sensible defaults.

## 9. Adapters that can be replaced later

| Port              | Default adapter       | Alternatives                |
| ----------------- | --------------------- | --------------------------- |
| `AuthProvider`    | Google OIDC (Auth.js) | any OIDC IdP                |
| `RealtimeAdapter` | Supabase Realtime     | Pusher, Ably, LISTEN/NOTIFY |
| `RateLimiter`     | In-memory (dev)       | Redis/Upstash (prod)        |
| `TokenHasher`     | SHA-256 (HMAC) hasher | argon2 for higher cost      |
| `Clock`           | System clock          | fixed clock in tests        |
