# Product Requirements Document — CUET Expense Splitter

## 1. Purpose

A private web application that lets CUET classmates create project groups,
invite fellow CUET students, record shared project expenses, and compute each
member's **equal share** and **net balance**. It supports periodic
**settlement** of the current expense cycle while preserving lifetime totals and
full history.

## 2. Target users

- CUET students whose institutional email matches a configured pattern
  (default `^u2204[0-9]{3}@student\.cuet\.ac\.bd$`).
- Users organize into small private project groups (typically 2–10 members).

## 3. Goals

1. Authenticate students exclusively through Google OAuth / OpenID Connect,
   restricted to the CUET student email domain — validated **server-side**.
2. Allow a student to create a private project and become its immutable creator
   and first leader.
3. Allow the leader/creator to invite other CUET students by email.
4. Let every active member record their own expenses in BDT.
5. Compute per-member equal share and net balance in real time.
6. Let the leader settle the current cycle atomically, snapshotting balances.
7. Preserve lifetime totals and settlement history after settlement.
8. Enforce strict per-project privacy and authorization on every operation.

## 4. Non-goals (initial release)

- No unequal / weighted / percentage splits (equal split only).
- No member removal or self-leave once expenses exist (documented future work).
- No public project links or public sharing.
- No in-app payment execution / money transfer.
- No multi-currency (BDT only).
- No application-controlled OTP in v1 (behind a feature flag, off by default).

## 5. Core domain rules

### 5.1 Identity

- Google `sub` claim is the permanent external identity key (`User.googleSub`).
- Email is **not** the primary identity key; it is a unique secondary attribute
  (normalized lowercase).
- A login is accepted only if: token signature/issuer/audience/expiry valid,
  `email_verified === true`, email matches the CUET regex, and (when present)
  the Google Workspace `hd` claim matches the configured hosted domain.

### 5.2 Roles per project

| Role    | Count     | Notes                           |
| ------- | --------- | ------------------------------- |
| Creator | exactly 1 | Immutable, set at creation      |
| Leader  | exactly 1 | Starts as creator; transferable |
| Member  | 0..N      | Ordinary active members         |

- Creator is always a member; leader must always be an active member.
- Leadership transfer target must be an active member; recorded in audit log.

### 5.3 Money

- Currency: BDT. Stored as **integer paisa** (`Int`/`BigInt`), never float.
- Amount must be `> 0`.
- Display with two decimals (`৳X.XX`) when needed.
- Equal split remainder distributed deterministically (see DATABASE.md /
  calculation service).

### 5.4 Expenses

- Owned by the paying member; payer ID immutable after creation.
- Only the owner can edit/delete, and **only while unsettled**.
- Settled expenses are locked; corrections happen as new adjustment entries in a
  later cycle.

### 5.5 Totals

- **Lifetime total**: sum of ALL expenses (settled + unsettled); never resets.
- **Current-cycle total**: sum of unsettled expenses; resets to 0 after
  settlement.
- Per active member: `currentPaid`, `currentShare = cycleTotal / activeMembers`,
  `netBalance = currentPaid - currentShare`.

### 5.6 Settlement

- Leader-only, atomic transaction, idempotent (idempotency key), concurrency
  safe (row lock / conditional update). Produces an immutable `Settlement` plus
  one `SettlementBalance` snapshot per included member, and attaches all included
  expenses. After commit the current cycle is empty.

## 6. Pages

- `/login` — Google sign-in, CUET restriction messaging.
- `/dashboard` — created projects, member projects, pending invitations, create
  button.
- `/projects/new` — create project form.
- `/projects/[projectId]` — project dashboard (totals, balances, expenses,
  add-expense, settlement history, realtime state, leader controls).
- `/projects/[projectId]/settings` — rename, transfer leadership, invite, delete
  (leader/creator gated).
- `/invitations/[token]` — accept invitation (email-match gated).

## 7. Functional requirements summary

Displayed for each viewing member on the project dashboard:

- `netBalance < 0` → "You owe ৳X"
- `netBalance > 0` → "You should receive ৳X"
- `netBalance = 0` → "You are settled"
- "Your equal share" shown separately.

Worked example (must be unit-tested): 4 members, cycle total ৳100, one member
paid all. Equal share ৳25; payer receives ৳75; each other owes ৳25.

## 8. Success / Definition of Done

See root task checklist in `IMPLEMENTATION_PLAN.md`. The product is done when a
valid CUET student can authenticate, invalid accounts cannot, private projects
and invitations work only for the intended email, unauthorized access is
impossible, members manage only their own unsettled expenses, totals/balances
update live and correctly, settlement is atomic and idempotent, balances reset
while lifetime totals and history remain, settled records are immutable, and all
authorization + financial tests pass.

## 9. Assumptions & defaults chosen

- Invitation expiry: **7 days** (`INVITATION_TTL_HOURS=168`).
- Remainder distribution: give leftover paisa to members in a **stable,
  deterministic order** (by `userId` ascending) one paisa each until consumed.
- Realtime: Supabase Realtime (Postgres changes) behind a `RealtimeAdapter`
  interface; server-authorized channel names; clients re-fetch authoritative
  totals on events.
- Rate limits: auth callback and invitation creation/accept limited per
  IP+user (default 10/min invitations, sensible auth throttle).
