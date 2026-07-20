@AGENTS.md

# CUET Expense Tracker — project conventions

Design docs live in `docs/` (PRD, ARCHITECTURE, DATABASE, AUTHORIZATION,
SECURITY, IMPLEMENTATION_PLAN). `docs/IMPLEMENTATION_PLAN.md` is the source of
truth for phase progress.

## Version notes (installed, newer than common training data)

- **Next.js 16**: `params`/`searchParams` (in `page.tsx`/`layout.tsx`/`route.ts`)
  and `cookies()`/`headers()`/`draftMode()` are **Promises** — always `await`.
  Type page params as `Promise<{ ... }>`. The `middleware` convention is renamed
  to `proxy` (Node runtime only); we do authz in server components / actions via
  `auth()` + policy functions, not middleware. `next lint` is removed — use
  `eslint` directly. Turbopack is the default bundler (no webpack config).
- **Prisma 7**: uses `prisma.config.ts` for configuration; confirm generator/
  client-output specifics against installed docs before editing the schema.
- **Zod 4**: prefer `z.email()` over the deprecated `z.string().email()`; check
  API when a validator behaves unexpectedly.

## Core conventions

- Money is **integer paisa** (`BigInt`), BDT only. Never use floats for money.
  Use helpers in `src/lib/money.ts`.
- Every read/write of project data goes through a policy check in
  `src/lib/policy/` — never trust client-supplied ids/roles.
- External services (Google, Supabase, rate limiter) sit behind port interfaces
  in `src/lib/ports/`.
- All input validated server-side with Zod (`src/lib/validation/`).
- After each phase: `npm run typecheck && npm run lint && npm test`, then update
  the implementation plan. Do not claim a feature works unless its tests pass.
