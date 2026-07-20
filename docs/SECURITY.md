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

## 2. Authentication (Google OIDC) — server-side validation

On the Auth.js `signIn` / `jwt` callback, before accepting a user:

1. Verify ID token **signature** against Google JWKS, **issuer**
   (`https://accounts.google.com`), **audience** (`GOOGLE_CLIENT_ID`), and
   **expiry**. (Auth.js/`openid-client` performs this; we assert results.)
2. Require `email_verified === true`.
3. Require `email` to match `CUET_EMAIL_REGEX`
   (default `^u2204[0-9]{3}@student\.cuet\.ac\.bd$`).
4. If a hosted-domain is configured (`GOOGLE_HOSTED_DOMAIN`) and the `hd` claim
   is present, require `hd === GOOGLE_HOSTED_DOMAIN`.
5. Use `sub` as `User.googleSub` (permanent id). Email is secondary/unique.
6. Reject otherwise — return false from `signIn` → generic "not eligible"
   screen. The check is enforced regardless of any frontend state.

Passwords are **never** requested or stored. No Gmail credential handling.

### Optional OTP (feature flag `FEATURE_APP_OTP`, default off)

If later enabled: send a short-lived numeric code **only** to the already
verified CUET email, store **only a hash** (with per-code salt), expire in
minutes, cap attempts, and rate-limit requests. Off in v1.

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
