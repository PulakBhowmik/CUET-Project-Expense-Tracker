# Implementation Plan — CUET Expense Splitter

This document is the living checklist. Each phase is small and independently
testable. After every phase: show changed files, explain key decisions, run
lint + typecheck + relevant tests, update this file, and stop on failures.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (tests pass).

## Directory structure (target)

```
expense-tracker/
├─ docs/                      # PRD, ARCHITECTURE, DATABASE, AUTHORIZATION, SECURITY, this plan
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/            # includes raw SQL for CHECK + partial unique indexes
├─ docker-compose.yml         # local Postgres
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ dashboard/page.tsx
│  │  ├─ projects/new/page.tsx
│  │  ├─ projects/[projectId]/page.tsx
│  │  ├─ projects/[projectId]/settings/page.tsx
│  │  ├─ invitations/[token]/page.tsx
│  │  ├─ api/auth/[...nextauth]/route.ts
│  │  └─ layout.tsx, globals.css
│  ├─ components/            # shadcn/ui + app components (expense-table, balances…)
│  ├─ lib/
│  │  ├─ env.ts              # Zod-validated env
│  │  ├─ auth.ts             # Auth.js config + CUET signIn validation
│  │  ├─ db.ts               # Prisma client singleton
│  │  ├─ errors.ts          # typed domain errors + mapper
│  │  ├─ money.ts            # paisa helpers + formatting
│  │  ├─ ports/             # AuthProvider, RealtimeAdapter, Clock, RateLimiter, TokenHasher
│  │  ├─ adapters/          # prisma repos, supabase realtime, google, rate-limiter
│  │  ├─ policy/            # project-policy.ts (authorization)
│  │  ├─ services/          # project, invitation, expense, settlement, calc
│  │  └─ validation/        # Zod schemas (shared)
│  ├─ server/actions/        # Server Actions (thin controllers)
│  └─ types/
├─ tests/
│  ├─ unit/                  # calc, policy, money, remainder
│  ├─ integration/           # invitations, expense CRUD authz, settlement
│  ├─ e2e/                   # Playwright: login gating, IDOR, realtime
│  ├─ factories/             # user/project/member/expense builders
│  └─ setup/                 # test db bootstrap, fixtures
├─ .env.example
├─ eslint.config.mjs, .prettierrc, vitest.config.ts, playwright.config.ts
├─ tsconfig.json (strict)
└─ package.json
```

## Phase checklist

### Phase 0 — Repository setup & quality tooling ✅

- [x] Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + shadcn/ui init
- [x] ESLint + Prettier + `typecheck`/`lint`/`test`/`format` npm scripts
- [x] Vitest + Playwright configured (7 smoke/env tests passing)
- [x] `docker-compose.yml` Postgres + `.env.example` + local `.env`
- [x] `src/lib/env.ts` Zod env validation (fail fast) + unit tests
- **Gate:** ✅ typecheck clean, lint clean, 7 tests pass, `next build` succeeds.

### Phase 1 — Database schema & migrations ✅

- [x] `prisma/schema.prisma` per `docs/DATABASE.md`
- [x] Raw SQL migration `20260721000000_init`: 12 tables + amount CHECK +
      partial unique pending-invite index — **applied to live Supabase DB**
- [x] `src/lib/money.ts` (paisa parse/format) + unit tests (22 passing)
- [x] Prisma 7 client singleton (`src/lib/db.ts`) with pg driver adapter
- [x] `scripts/check-db.ts` (`npm run db:check`) verifies schema + constraints
      via the runtime pooler connection
- **Gate:** ✅ migration applied cleanly to Supabase; money tests pass;
  `db:check` confirms 12 tables + both custom constraints present.

### Phase 2 — Google auth & CUET restriction ✅ (code complete; needs real Google credentials)

- [x] Auth.js v5 Google provider (`type: "oidc"`) + Prisma adapter (`src/lib/auth.ts`)
- [x] `signIn` validation: email_verified, CUET regex, `hd`, sub→googleSub —
      wired to the already-tested `evaluateCuetSignIn` (`src/lib/cuet.ts`)
- [x] `EmailDomainPolicy` unit-tested (9 tests: valid/invalid/unverified/hd/
      reconfigured regex)
- [x] `/login` page with reason-specific error messages; `/dashboard` protected
      shell (redirects to `/login` when unauthenticated)
- **Gate:** ✅ typecheck/lint/57 tests pass; `next build` succeeds; **verified
  live in a real browser**: `/dashboard` → 307 redirect to `/login` when signed
  out; clicking "Sign in with Google" submits the server action (POST 303) and
  correctly reaches Google's real OIDC authorization endpoint with the
  configured `client_id` (rejected only because dev creds are placeholders —
  proof the wiring is genuine, not mocked).
- **Blocked on user input:** real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  (see `.env.example` for the 5-step Google Cloud Console guide) to test an
  actual CUET account end-to-end.

**Design decisions verified against installed source** (not assumed — see
`node_modules/@auth/core/src/lib/actions/callback/{index,handle-login}.ts`):
  - The `signIn` callback receives Google's **raw** OIDC claims (`sub`,
    `email`, `email_verified`, `hd`), matching `GoogleProfileLike`.
  - `signIn` runs **before** any DB write; returning `false`/a string means
    `createUser`/`linkAccount` never execute — a rejected sign-in leaves zero
    trace in the database.
  - The provider's `profile()` return value flows through to
    `PrismaAdapter.createUser`, so a custom `profile()` that adds
    `googleSub: profile.sub` guarantees the identity key is set at row
    creation — no window where a user exists without it.

### Phase 3 — Project creation & membership authorization ✅

- [x] `src/lib/policy/project-policy.ts`: `loadProjectContext` (member-or-404,
      never leaks project existence), `assertMember`, `assertLeaderPower`,
      `assertCanInvite`, `assertCanTransferLeadership`
- [x] `src/lib/services/project.ts`: `createProject` (creator=leader=member,
      one transaction), `listProjectsForUser`, `getProjectForUser`
- [x] `/projects/new` (form + Server Action + Zod validation),
      `/dashboard` (real created/member project lists),
      `/projects/[projectId]` (membership-gated detail page)
- [x] Shared `not-found.tsx` — deliberately identical message for "doesn't
      exist" and "you can't see it" (no existence leak)
- [x] Integration tests (`tests/integration/project.test.ts`, `tests/factories/`)
      run against the **real Supabase database**: creator=leader=member
      invariant, IDOR (non-member → NotFoundError, same as nonexistent id),
      duplicate membership rejected by the DB, list partitioning, member count
- **Gate:** ✅ typecheck/lint clean; **64 tests pass** (7 new integration tests,
  verified zero orphaned rows left in Supabase after the run via
  `npm run db:check`); `next build` succeeds (7 routes); live-browser check
  confirms `/projects/new` redirects (307) to `/login` when unauthenticated.
- **Fixed along the way:** Vitest doesn't auto-load `.env` the way Next.js
  does — added `import "dotenv/config"` to `vitest.setup.ts` so integration
  tests can reach the database.

### Phase 4 — Invitations ✅

- [x] `TokenHasher` port + HMAC-SHA-256 adapter (`src/lib/token-hasher.ts`);
      only the hash is stored, plaintext token shown once
- [x] `RateLimiter` port + in-memory adapter (`src/lib/rate-limit.ts`) for
      invite create/accept
- [x] Invitation service (`src/lib/services/invitation.ts`): create, accept,
      list-pending (per project), list-for-user (own email only), preview
- [x] Duplicate-pending enforced by the partial-unique index (P2002 → friendly
      ConflictError); TTL expiry; audit log entries
- [x] `/invitations/[token]` page (unauth → sign in; wrong account → blocked;
      matching account → accept), shareable-link UI (no email service)
- [x] Dashboard "pending invitations" section; project page invite form
      (leader/creator only)
- [x] Integration tests (`tests/integration/invitation.test.ts`, 12 tests):
      email mismatch rejected (#5), duplicate invite blocked (#6), invite
      existing member, non-CUET rejected, member-can't-invite, accept flow,
      double-accept, invalid token, per-project + per-user scoping
- **Gate:** ✅ typecheck/lint clean; **75 tests pass**; zero orphaned rows.
- **Bug caught by these tests:** the `.env` CUET regex used double backslashes
  (`\\.`), which dotenv reads literally — the pattern matched nothing, so every
  invite (and every real login in production) would have been rejected. Fixed to
  single backslashes in `.env`/`.env.example` with a warning comment.

### Phase 5 — Expense CRUD ✅

- [x] Expense service (`src/lib/services/expense.ts`) + Zod DTOs (amount>0 via
      `takaToPaisa`, payer taken from session not client, immutable payer/project)
- [x] `assertCanModifyExpense` policy (payer + unsettled; settled = locked for
      everyone including leader/creator)
- [x] Server Actions create/edit/delete; `updateMany`/`deleteMany` guard against
      a settlement racing between read and write
- [x] Balances service (`src/lib/services/balances.ts`) wiring calc to real data:
      authoritative lifetime total + current-cycle equal-split from the DB
- [x] UI: add-expense form, expense table (owner-only edit/delete via dialogs),
      balances panel ("You owe/should receive/settled", your share, totals)
- [x] Integration tests (`tests/integration/expense.test.ts`, 9 tests): member
      creates (#8), owner edits (#9), other member blocked (#10), leader blocked
      (#11), delete authz, settled-lock, the ৳100/4 balance example end-to-end,
      lifetime-vs-cycle totals
- **Gate:** ✅ typecheck/lint clean; **84 tests pass**; zero orphaned rows;
  `next build` succeeds (8 routes).

### Phase 6 — Calculation service ✅ (done early — pure logic, no DB)

- [x] `calc.ts`: cycle total, equal share, deterministic remainder, net balance
- [x] Unit tests incl. the ৳100/4 example, remainder, payer reimbursement,
      invariants (Σshare=total, Σnet=0), balance messages
- **Gate:** ✅ all calculation unit tests pass (part of 52 passing).

### Phase 7 — Realtime synchronization

- [ ] `RealtimeAdapter` port + Supabase adapter; RLS policies
- [ ] Client subscribe to `project:{id}`; re-fetch authoritative totals on event
- [ ] Reconnection + duplicate-event handling; connection-state indicator
- **Gate:** integration (adapter contract) + E2E two-context update.

### Phase 8 — Settlement transaction & history ✅

- [x] Settlement service (`src/lib/services/settlement.ts`): one interactive
      transaction with `SELECT ... FOR UPDATE` on the project row, immutable
      Settlement + per-member SettlementBalance snapshot, expenses attached via
      a `settlementId IS NULL` guarded updateMany, audit log — all committed
      together (20s timeout so a waiting request queues rather than failing)
- [x] Idempotency via unique `(projectId, idempotencyKey)`: a replayed key
      returns the existing settlement instead of creating a duplicate
- [x] "Mark current expenses as split" + confirmation modal showing total,
      member count, equal share, and each member's paid/share/result
- [x] Settlement history UI (permanent snapshots); button disabled when nothing
      is unsettled
- [x] Integration tests (`tests/integration/settlement.test.ts`, 9 tests):
      snapshot correctness (৳100/4), cycle reset (#15), lifetime preserved +
      history (#16), fresh cycle after settling, idempotency (#18), **concurrent
      settlement never double-settles (#19)**, nothing-to-settle rejected,
      member-cannot-settle, deterministic remainder in the snapshot
- **Gate:** ✅ typecheck/lint clean; **93 tests pass**; zero orphaned rows.

### Phase 9 — Project settings, leadership & deletion ✅

- [x] `renameProject` (leader power, audited)
- [x] `transferLeadership` (leader **or** creator → any active member; single
      `leaderMemberId` column guarantees exactly one leader; audited)
- [x] `deleteProject` (leader power; caller must type the exact project name,
      re-validated server-side; audited before the cascade removes the row)
- [x] `/projects/[projectId]/settings` page + Settings link; ordinary members
      see a "leader only" message instead of controls
- [x] Integration tests (`tests/integration/project-settings.test.ts`, 14):
      rename authz (leader/member/non-member), transfer to active member,
      audit entry written, creator can transfer back after giving it away,
      member cannot transfer, cannot transfer to non-member or current leader,
      delete authz (#20), name-mismatch rejected, cascade to expenses
- **Gate:** ✅ typecheck/lint clean; **107 tests pass**; `next build` (9 routes).

### Phase 10 — Complete automated test suite

- [ ] Fill any gaps in the required test list (below); factories readable
- **Gate:** full `npm test` green; coverage on money/policy/settlement.

### Phase 11 — Accessibility, responsiveness, error/empty/loading states

- [ ] Loading/empty/error/unauthorized states on all pages; responsive layout
- [ ] a11y pass (labels, focus, contrast, keyboard)
- **Gate:** lint/typecheck green; E2E smoke on mobile viewport.

### Phase 12 — Deployment documentation

- [ ] `docs/DEPLOYMENT.md`: env setup, Google OAuth config, Supabase, Vercel,
      migrations, seeding
- **Gate:** doc reviewed; `.env.example` complete.

### Phase 13 — Final security & code review

- [ ] Run `/security-review`; address findings
- [ ] Verify Definition of Done items each map to a passing test
- **Gate:** all DoD checks green.

## Required tests (traceability)

| #   | Test                                   | Level       | Phase |
| --- | -------------------------------------- | ----------- | ----- |
| 1   | Valid CUET login accepted              | unit/e2e    | 2     |
| 2   | Non-CUET account rejected              | unit        | 2     |
| 3   | Unverified email rejected              | unit        | 2     |
| 4   | Unauthorized project-id access → 404   | integration | 3     |
| 5   | Invitation email mismatch rejected     | integration | 4     |
| 6   | Duplicate invitation blocked           | integration | 4     |
| 7   | Duplicate membership blocked           | integration | 3     |
| 8   | Member adds an expense                 | integration | 5     |
| 9   | Member edits own expense               | integration | 5     |
| 10  | Member blocked editing others' expense | integration | 5     |
| 11  | Leader blocked editing others' expense | integration | 5     |
| 12  | Equal split calculation (৳100/4)       | unit        | 6     |
| 13  | Remainder handling deterministic       | unit        | 6     |
| 14  | Payer reimbursement (৳75)              | unit        | 6     |
| 15  | Settlement resets current cycle        | integration | 8     |
| 16  | Lifetime total preserved               | integration | 8     |
| 17  | Settled expense locked (no edit/del)   | integration | 8     |
| 18  | Duplicate settlement (idempotency)     | integration | 8     |
| 19  | Concurrent settlement (no double)      | integration | 8     |
| 20  | Project deletion authorization         | integration | 9     |
| 21  | Realtime update across two sessions    | integration + manual | 7 |

## Definition of Done → verification map

Each DoD bullet in `PRD.md §8` is satisfied by the correspondingly numbered
test(s) above plus manual E2E confirmation in Phase 13.

## Progress log

- 2026-07-21: Docs authored (PRD, ARCHITECTURE, DATABASE, AUTHORIZATION,
  SECURITY, this plan). Approved to proceed.
- 2026-07-21: **Phase 0 complete.** Scaffolded Next.js 16 (App Router,
  Turbopack) + React 19 + TypeScript strict (target ES2022) + Tailwind v4 +
  shadcn/ui (radix-nova). Installed Prisma 7, Auth.js v5, Zod 4, Vitest 4,
  Prettier. Added env validation (`src/lib/env.ts`), `.env.example`. Gate green:
  typecheck, lint, 7 tests, `next build` all pass.
- 2026-07-21: **Plan revision — simplify (user request).** No local Docker;
  database is free hosted **Supabase Postgres** (dev + prod, Vercel-friendly).
  Live updates via lightweight polling instead of websockets/RLS. Dropped
  Playwright e2e; keep Vitest unit + targeted integration tests. Removed
  `docker-compose.yml`; `prisma.config.ts` uses `DIRECT_URL` for migrations.
- 2026-07-21: **Phase 1 (code) + Phase 6 + Phase 2 (email policy) done.** Prisma
  schema written & validated; `money.ts`, `calc.ts` (equal split/remainder),
  `cuet.ts` (sign-in policy) all implemented with **52 unit tests passing**
  (typecheck + lint clean). Remaining Phase 1 step (apply migration) is blocked
  only on the Supabase connection string.
- 2026-07-21: **Phase 1 fully complete.** User created a free Supabase Postgres
  project and provided the connection string. Migration `20260721000000_init`
  applied successfully (12 tables, enums, indexes, FKs, positive-amount CHECK,
  partial-unique pending-invite index) — verified live via `npm run db:check`.
  Also removed Playwright/e2e entirely per the simplification decision (no
  e2e tests existed yet, nothing lost); realtime + cross-browser checks will be
  covered by integration tests + manual verification instead. Gate green: 57
  tests, typecheck, lint. Local `.env` holds the real (dev) Supabase credentials
  and is git-ignored.
- 2026-07-21: **Phase 2 complete (code).** Wired Auth.js v5 to Google OIDC with
  the CUET sign-in policy (`src/lib/auth.ts`), a custom `profile()` mapping that
  sets `googleSub` at row-creation time, `/login` (reason-specific error
  messages) and a protected `/dashboard` shell. Verified live in a real browser:
  unauthenticated `/dashboard` redirects (307) to `/login`; the sign-in button
  reaches Google's real authorization endpoint (rejected only due to placeholder
  dev credentials). Gate green: typecheck, lint, 57 tests, `next build`. Waiting
  on the user to create a real Google OAuth client to test an actual CUET login.
- 2026-07-21: **Phase 3 complete.** Project creation + membership authorization:
  policy layer, service layer, `/projects/new`, real `/dashboard` project
  lists, `/projects/[projectId]` detail page, shared `not-found.tsx`. First
  real integration tests against the live Supabase DB (7 tests: creator/leader/
  member invariant, IDOR protection, duplicate-membership rejection, list
  partitioning) — all passing with verified zero test-data leftover. Gate
  green: typecheck, lint, **64 tests**, `next build` (7 routes), live-browser
  redirect check. GitHub push still pending a repo URL from the user.
- 2026-07-21: **Phase 4 complete.** Invitations via shareable link (user chose
  this over an email service). Token hashing (store hash only), rate limiting,
  full accept flow with the critical email-match gate, `/invitations/[token]`
  page. 12 integration tests (75 total). Caught & fixed a real `.env` regex
  escaping bug that would have blocked all logins/invites in production. User
  provided GitHub repo: PulakBhowmik/CUET-Project-Expense-Tracker — pushing now.
  User clarified: keep automated tests, but they'll do manual feature-testing
  themselves at the end (I don't need to click through every feature live).
