# CUET Expense Splitter

A private web app for CUET classmates to record shared project expenses and
split them **equally**, then settle up. Only invited CUET students can see a
project.

Built with Next.js (App Router), TypeScript, PostgreSQL/Prisma, Auth.js
(email + password), and Tailwind + shadcn/ui. Deploys to Vercel.

---

## What it does

- **Sign up with your CUET email.** A 6-digit code is emailed to prove you own
  the address, then you set a password. Only CUET addresses are accepted, and
  that rule is enforced on the server so it can't be bypassed.
- **Create private projects.** The creator is permanent; there's exactly one
  leader at a time, and leadership can be transferred.
- **Invite classmates** by CUET email using a one-time link. Only the invited
  address can accept it.
- **Record expenses** in BDT. You can edit or delete only _your own_ expenses,
  and only before they're settled.
- **See balances live** — your equal share, what you paid, and whether you
  _owe_ or _should receive_ money. Updates without refreshing.
- **Settle the cycle.** The leader locks the current expenses in one atomic
  transaction that snapshots what everyone paid and owed. Lifetime totals and
  full history are preserved.

### How the split works

Every active member owes an equal share of the current cycle's total.

> 4 members, ৳100 total, one member paid it all
> → each share is ৳25 · the payer **should receive ৳75** · everyone else
> **owes ৳25**.

Money is stored as **integer paisa** (never floating point). When a total
doesn't divide evenly, leftover paisa are distributed deterministically so the
shares always add back up to exactly the total, and all balances sum to zero.

---

## Quick start

```bash
npm install
cp .env.example .env    # then fill in the values
npm run dev             # http://localhost:3000
```

You'll need a free [Supabase](https://supabase.com) database. Email sending is
**not** needed locally — sign-in codes are printed to your terminal.
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** walks through both, then through
deploying to Vercel.

## Commands

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the dev server                     |
| `npm test`          | Run the test suite                       |
| `npm run typecheck` | TypeScript check                         |
| `npm run lint`      | ESLint                                   |
| `npm run build`     | Production build                         |
| `npm run db:check`  | Verify the database schema & constraints |
| `npm run db:studio` | Browse the database                      |

---

## Testing

`npm test` runs unit tests (money math, equal split, CUET rules, password
hashing, error handling) and integration tests that run against a real PostgreSQL database
covering authorization, invitations, expense ownership, and settlement safety —
including that concurrent settlements can never settle the same expense twice.

For hands-on browser testing, follow **[docs/TESTING.md](docs/TESTING.md)**.

---

## Documentation

| Doc                                                | Contents                              |
| -------------------------------------------------- | ------------------------------------- |
| [PRD](docs/PRD.md)                                 | Product requirements and domain rules |
| [ARCHITECTURE](docs/ARCHITECTURE.md)               | Stack, layering, request flow         |
| [DATABASE](docs/DATABASE.md)                       | Schema, constraints, indexes          |
| [AUTHORIZATION](docs/AUTHORIZATION.md)             | Who can do what — the full matrix     |
| [SECURITY](docs/SECURITY.md)                       | Threat model and mitigations          |
| [DEPLOYMENT](docs/DEPLOYMENT.md)                   | Setup and deploying to Vercel         |
| [TESTING](docs/TESTING.md)                         | Manual test checklist                 |
| [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md) | Build phases and progress             |

## Security highlights

- Authorization is enforced in server-side policy functions on **every** read
  and write — hidden buttons are never the control.
- Guessing another project's URL returns **404**, so you can't even learn it
  exists.
- Sign-in codes and invitation tokens are stored **hashed**, expire, and are
  single-use; codes also cap failed attempts and rate-limit sends.
- Passwords are hashed with **scrypt** and never stored or logged in plain text.
- Settlement runs in one transaction with a row lock plus an idempotency key,
  so it can't double-settle or duplicate.
- Raw database errors are never shown to users.
