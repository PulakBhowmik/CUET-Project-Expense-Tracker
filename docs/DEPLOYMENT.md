# Deployment Guide — CUET Expense Splitter

This walks you from the GitHub repo to a **live link you can share with your
classmates**. Follow it top to bottom; nothing here needs Docker or a server.

You need three free accounts: **GitHub** (done), **Supabase** (database, done),
and **Google Cloud** (for "Sign in with Google"), plus **Vercel** (hosting).

---

## Part 1 — Google sign-in credentials

The app only lets CUET students in, and it does that through Google. You need to
register the app with Google once.

> Google renamed this area: the old **"OAuth consent screen"** page is now
> **"Google Auth Platform"**. The direct links below are the quickest route —
> menu names move around, URLs don't.

**1. Create the project**

Go to <https://console.cloud.google.com/> → top-left project dropdown →
**New Project** → name it `CUET Expense Tracker` → **Create**. Wait a few
seconds, then make sure it's the selected project.

**2. Register the app (the old "consent screen")**

Open <https://console.cloud.google.com/auth/overview> → click **GET STARTED**,
then fill the short wizard:

| Wizard step             | What to enter                                                     |
| ----------------------- | ----------------------------------------------------------------- |
| **App Information**     | App name `CUET Expense Tracker`; your email as User support email |
| **Audience**            | **External**                                                      |
| **Contact Information** | your email address                                                |
| **Finish**              | tick the policy checkbox → **Create**                             |

**3. Add test users**

Open <https://console.cloud.google.com/auth/audience> → under **Test users**
click **+ Add users** → add every email you'll sign in with → **Save**.

> While the app is in **Testing** mode, only these addresses can sign in — even
> valid CUET ones. Skipping this causes an "app has not completed verification"
> or `access_denied` error.

**4. Create the OAuth client**

Open <https://console.cloud.google.com/auth/clients> → **+ CREATE CLIENT**:

- **Application type**: `Web application`
- **Name**: `CUET Expense Tracker Web`
- **Authorized redirect URIs** → **+ ADD URI** → paste exactly:
  ```
  http://localhost:3000/api/auth/callback/google
  ```
  (You'll add the Vercel URL in Part 3, once you know it.)
- **CREATE**

**5. Copy the credentials into `.env`**

```
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="...."
```

> ⚠️ The **client secret is shown only once**, right after you create the
> client. Copy it immediately. If you lose it, delete the client and make a new
> one.

> **Note on the CUET restriction:** Google will happily let any Google account
> through — the app itself rejects anyone whose verified email doesn't match
> `CUET_EMAIL_REGEX`. That check runs on the server, so it can't be bypassed.

---

## Part 2 — Generate your secrets

Two secrets must be long random strings. Generate them:

```bash
# Run this twice — once for each secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put them in `.env`:

```
AUTH_SECRET="<first random string>"
INVITATION_TOKEN_SECRET="<second random string>"
```

> ⚠️ Use **different** values for production than for local development, and
> never commit `.env` (it's git-ignored).

---

## Part 3 — Deploy to Vercel

1. Go to <https://vercel.com> → **Sign up** → **Continue with GitHub**.
2. **Add New… → Project** → find `CUET-Project-Expense-Tracker` → **Import**.
3. Vercel auto-detects Next.js. **Do not deploy yet** — first open
   **Environment Variables** and add each of these (copy the values from your
   local `.env`):

   | Name                      | Value                                               |
   | ------------------------- | --------------------------------------------------- |
   | `DATABASE_URL`            | Supabase **transaction pooler** URI (port **6543**) |
   | `DIRECT_URL`              | Supabase **session pooler** URI (port **5432**)     |
   | `AUTH_SECRET`             | your generated secret                               |
   | `INVITATION_TOKEN_SECRET` | your other generated secret                         |
   | `GOOGLE_CLIENT_ID`        | from Part 1                                         |
   | `GOOGLE_CLIENT_SECRET`    | from Part 1                                         |
   | `CUET_EMAIL_REGEX`        | `^u2204[0-9]{3}@student\.cuet\.ac\.bd$`             |

   > **Important:** in `CUET_EMAIL_REGEX` use **single** backslashes (`\.`).
   > Double backslashes silently break the pattern and block every login.

   Optional: `INVITATION_TTL_HOURS` (default `168`), `GOOGLE_HOSTED_DOMAIN`,
   `RATE_LIMIT_INVITES_PER_MIN`, `RATE_LIMIT_ACCEPT_PER_MIN`.

4. Click **Deploy** and wait for the build.
5. Vercel gives you a URL like `https://cuet-project-expense-tracker.vercel.app`.
   **This is your shareable link.**
6. **Go back to <https://console.cloud.google.com/auth/clients> → your OAuth
   client** and add the production redirect URI (replace with your actual
   domain):

   ```
   https://YOUR-APP.vercel.app/api/auth/callback/google
   ```

   Save. Without this, sign-in on the live site fails with `redirect_uri_mismatch`.

7. Also add `AUTH_URL` in Vercel's environment variables set to your live URL
   (e.g. `https://YOUR-APP.vercel.app`) if sign-in redirects misbehave, then
   redeploy.

---

## Part 4 — Database migrations

The database schema is applied with Prisma migrations. The migration for the
current schema has already been applied to your Supabase project.

Whenever the schema changes, run this **locally** (it uses `DIRECT_URL`):

```bash
npx prisma migrate deploy
```

Verify the database is healthy at any time:

```bash
npm run db:check
```

Expected output: 12 tables, the positive-amount CHECK present, and the
pending-invite unique index present.

> Vercel does **not** run migrations automatically — that's deliberate, so a
> deploy can never unexpectedly alter your data.

---

## Part 5 — Going live for real users

While the app is in **Testing** mode, only the test users you listed can sign
in. To open it to all CUET students:

- Open <https://console.cloud.google.com/auth/audience> → **PUBLISH APP**.
- For the scopes this app uses (email/profile only), Google does not require a
  verification review.

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

Useful commands:

| Command             | What it does                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Start the app locally              |
| `npm test`          | Run the full test suite            |
| `npm run typecheck` | TypeScript check                   |
| `npm run lint`      | ESLint                             |
| `npm run build`     | Production build                   |
| `npm run db:check`  | Verify database schema/constraints |
| `npm run db:studio` | Browse the database in a GUI       |

---

## Troubleshooting

| Problem                                                 | Fix                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch` on sign-in                      | Add the exact callback URL to Google Credentials (Part 3 step 6). It must match including `https://` and no trailing slash.                                                                                                                                                           |
| Signed in with Google but rejected                      | Your email doesn't match `CUET_EMAIL_REGEX`, or it isn't verified. That's the CUET restriction working.                                                                                                                                                                               |
| Every login is rejected, even valid ones                | Check `CUET_EMAIL_REGEX` uses **single** backslashes.                                                                                                                                                                                                                                 |
| `Can't reach database server`                           | Check `DATABASE_URL`/`DIRECT_URL`, and that the Supabase project isn't paused (free projects pause after inactivity — open the Supabase dashboard to resume).                                                                                                                         |
| Build fails on Vercel with missing env                  | Add the missing variable in Project Settings → Environment Variables, then redeploy.                                                                                                                                                                                                  |
| Invitation link says invalid                            | Links expire after `INVITATION_TTL_HOURS` (default 7 days) and are single-use. Send a fresh one.                                                                                                                                                                                      |
| **"Not found" page right after signing in (local dev)** | The Turbopack cache went stale and stopped registering `/api/auth/*`, so Google's redirect back hits a 404. Stop the dev server, delete the `.next` folder, and run `npm run dev` again. Verify with `curl http://localhost:3000/api/auth/providers` — it must return JSON, not HTML. |

---

## Security checklist before sharing the link

- [ ] `.env` is **not** committed (verify: `git ls-files | grep "^.env$"` returns nothing)
- [ ] Production `AUTH_SECRET` and `INVITATION_TOKEN_SECRET` differ from the dev ones
- [ ] `CUET_EMAIL_REGEX` set correctly in Vercel (single backslashes)
- [ ] Supabase database password is not shared publicly
- [ ] Only the intended redirect URIs are listed in Google Credentials
