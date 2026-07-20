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

### Phase 1 — Database schema & migrations (code done; migration pending DB)

- [x] `prisma/schema.prisma` per `docs/DATABASE.md` (validates; offline SQL diff OK)
- [ ] Raw SQL migration: amount CHECK, partial unique pending-invite index
      (blocked on Supabase connection — apply once DATABASE_URL is set)
- [x] `src/lib/money.ts` (paisa parse/format) + unit tests (22 passing)
- [x] Prisma 7 client singleton (`src/lib/db.ts`) with pg driver adapter
- **Gate:** money unit tests pass ✅; migrate-applies pending DB.

### Phase 2 — Google auth & CUET restriction

- [ ] Auth.js Google provider + Prisma adapter
- [ ] `signIn` validation: email_verified, CUET regex, `hd`, sub→googleSub
- [ ] `EmailDomainPolicy` unit-tested (valid/invalid/unverified)
- [ ] `/login` page + gating; unauthorized state
- **Gate:** unit tests for CUET accept/reject/unverified pass.

### Phase 3 — Project creation & membership authorization

- [ ] `project-policy.ts` + `loadContext`; typed errors
- [ ] project service: create (creator=leader=member atomically)
- [ ] `/projects/new`, `/dashboard` (created + member projects)
- [ ] Integration: IDOR (non-member → 404), duplicate membership blocked
- **Gate:** membership/IDOR integration tests pass.

### Phase 4 — Invitations

- [ ] TokenHasher port + adapter; invitation service (create/accept/revoke)
- [ ] Partial-unique duplicate-pending enforcement; expiry
- [ ] `/invitations/[token]` accept flow (email-match gated)
- [ ] Integration: mismatch reject, duplicate invite, invite existing member,
      expired token, accept-by-wrong-user
- **Gate:** invitation integration tests pass.

### Phase 5 — Expense CRUD

- [ ] expense service + Zod DTOs (amount>0, immutable payer/project)
- [ ] Server Actions: create/edit/delete (owner+unsettled policy)
- [ ] Expense table + add/edit/delete UI (owner-only controls)
- [ ] Integration: member creates; owner edits; other blocked; leader blocked;
      settled locked
- **Gate:** expense authz integration tests pass.

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

### Phase 8 — Settlement transaction & history

- [ ] settlement service: atomic tx, row lock, idempotency, snapshot balances
- [ ] "Mark current expenses as split" + confirmation modal (breakdown)
- [ ] Settlement history UI; disable button when nothing unsettled
- [ ] Integration: reset, lifetime preserved, settled lock, duplicate (same key),
      concurrent (no double settle)
- **Gate:** settlement integration + concurrency tests pass.

### Phase 9 — Project settings, leadership & deletion

- [ ] rename (leader), transfer leadership (creator/leader → active member, audit)
- [ ] delete project (confirm dialog + type name; leader; audit)
- [ ] `/projects/[projectId]/settings`
- [ ] Integration: rename/transfer/delete authz; delete name-match required
- **Gate:** settings authz tests pass.

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
| 21  | Realtime update across two sessions    | e2e         | 7     |

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
