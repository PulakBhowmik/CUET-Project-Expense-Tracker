# Security — CUET Expense Splitter

## 1. Threat model (highlights)

| Threat                             | Mitigation                                        |
| ---------------------------------- | ------------------------------------------------- |
| Non-CUET account signs in          | Server-side OIDC claim validation + regex + `hd`  |
| Frontend bypass / direct API call  | All authz in server policy layer, not UI          |
| IDOR (guess project/expense id)    | `loadContext` membership check → 404              |
| Invitation token theft / replay    | Hash-only storage, expiry, single-use, email bind |
| Editing others' / settled expenses | Owner+unsettled policy, settled rows locked       |
| Double / concurrent settlement     | Tx + row lock + idempotency unique index          |
| Mass assignment                    | Zod DTOs, server-derived immutable fields         |
| Money precision errors             | Integer paisa only, no floats                     |
| Secret leakage to browser          | No secrets in `NEXT_PUBLIC_*`; env boundary       |
| Realtime data leakage              | Supabase RLS + server-authorized channels         |
| Brute force auth / invite spam     | Rate limiting per IP+user                         |
| Raw DB errors leaking internals    | Central error mapper → safe messages              |

## 2. Authentication (email + one-time code + password)

Sign-up proves the user controls a CUET address before any account exists:

1. The address must match `CUET_EMAIL_REGEX` — checked server-side on every
   path (requesting a code, setting a password, signing in, being invited).
2. A cryptographically random 6-digit code is emailed. **Only an HMAC-SHA-256
   hash of the code is stored** (keyed with `INVITATION_TOKEN_SECRET` and bound
   to the email, so a hash can't be replayed for another address).
3. Codes expire in 10 minutes, allow at most 5 failed attempts, and are
   invalidated when a newer code is issued.
4. Sends are rate-limited: a 30-second cooldown and at most 5 codes per address
   per 15 minutes.
5. Only after a code is **consumed** (single-use, guarded by a conditional
   update so concurrent requests can't both succeed) is a password accepted.
6. Passwords are hashed with **scrypt** (`N=16384, r=8, p=1`, random 16-byte
   salt per password) using Node's built-in crypto — no native dependency.
   Verification is constant-time via `timingSafeEqual`.

Sign-in compares the password against the stored hash. Failures are
indistinguishable: a wrong password and an unknown address both return `null`,
and a dummy hash is computed for missing users so response timing doesn't
reveal whether an address is registered.

Password reset reuses the same machinery with a distinct `PASSWORD_RESET`
purpose — a code issued for sign-up cannot be used to reset a password.

Passwords are never logged, never returned by any query used for display, and
never leave the server.

## 3. Sessions & cookies

- Auth.js database sessions; cookies `httpOnly`, `secure` (prod), `sameSite=lax`.
- CSRF: Auth.js built-in CSRF token for auth routes; Server Actions are
  same-origin POSTs with framework CSRF protection. State-changing Route
  Handlers verify origin + session.

## 4. Input validation & mass assignment

- Every input parsed by a **Zod** schema server-side (length caps, types,
  BDT amount `> 0`, email normalized + CUET regex).
- Update DTOs whitelist only mutable fields; immutable/derived fields
  (`payerUserId`, `projectId`, roles, `settlementId`) never accepted from client.

## 5. Invitations

- Token = high-entropy random (32 bytes); only its **hash** (`TokenHasher`
  port, HMAC-SHA-256 with `INVITATION_TOKEN_SECRET`) stored.
- The plaintext token is delivered once via the invite link and never persisted.
- Expiry `INVITATION_TTL_HOURS` (default 168h). Accept requires PENDING +
  not expired + email match + not already a member. Single-use (status →
  ACCEPTED atomically). Duplicate PENDING blocked by partial unique index.

## 6. Rate limiting

- `RateLimiter` port. Auth callback and invitation create/accept limited per
  IP + user id (defaults: invites 10/min, accept 20/min, sensible auth
  throttle). Returns `RateLimitError` → 429 with safe message.

## 7. Secrets & environment validation

- `src/lib/env.ts` validates all env vars with Zod at startup and **throws**
  on missing/invalid (fail fast). Required:
  `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `CUET_EMAIL_REGEX`, `INVITATION_TOKEN_SECRET`, `NEXTAUTH_URL`/`AUTH_URL`,
  Supabase keys. Optional: `GOOGLE_HOSTED_DOMAIN`, `INVITATION_TTL_HOURS`,
  `FEATURE_APP_OTP`, rate-limit knobs.
- Only `NEXT_PUBLIC_*` values reach the browser (Supabase anon URL/key only).
  Service-role keys and secrets stay server-side.

## 8. Transaction safety & audit

- Settlement and leadership transfer run in Prisma `$transaction` with row
  locks; important actions write structured `AuditLog` rows (actor, action,
  target, metadata, timestamp).

## 9. Error handling

- Central mapper: typed domain errors → status + safe message. Unexpected
  errors logged with correlation id server-side; user sees generic text. Raw
  Prisma/Postgres error strings are **never** returned to the client.

## 10. Destructive-operation confirmation

- Project deletion requires a confirmation dialog **and typing the exact
  project name**; server re-validates leadership + name match. Settlement shows
  a pre-commit confirmation modal with the full breakdown.

## 11. Realtime authorization

- Supabase RLS policies restrict row visibility to active members; channel
  authorization mirrors app policy. Clients treat events as signals and
  re-fetch authoritative data; money is never trusted from broadcast payloads.

## 12. Security test coverage

Enumerated in `IMPLEMENTATION_PLAN.md` §Testing; includes non-CUET rejection,
unverified-email rejection, IDOR, invite email mismatch, duplicate invite/
membership, cross-member expense edit block, settled-lock, duplicate/concurrent
settlement, and deletion authorization.
