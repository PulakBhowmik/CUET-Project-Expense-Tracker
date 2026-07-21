# Deployment Guide — CUET Expense Splitter

This walks you from the GitHub repo to a **live link you can share with your
classmates**. Follow it top to bottom; nothing here needs Docker or a server.

You need: **GitHub** (done), **Supabase** (database, done), an **email sender**
(to deliver sign-in codes), and **Vercel** (hosting).

---

## Part 1 — Email delivery (for sign-in codes)

Signing up sends a 6-digit code to the user's CUET address, so the app needs a
way to send email.

> **Local development needs nothing.** Leave the `SMTP_*` variables unset and
> the code is printed straight to your terminal, so you can test the whole flow
> without an email account. You only need this for the deployed site.

Pick one provider and copy its SMTP settings.

### Option A — Gmail (free, sends to anyone)

1. Turn on **2-Step Verification** on your Google account (required for the
   next step).
2. Create an **App Password**: <https://myaccount.google.com/apppasswords> —
   name it `CUET Expense Splitter`. Google shows a 16-character password once.
3. Use these values:

   ```
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="587"
   SMTP_USER="you@gmail.com"
   SMTP_PASSWORD="the 16-character app password"
   SMTP_FROM="CUET Expense Splitter <you@gmail.com>"
   ```

   Gmail allows roughly 500 messages a day — far more than this app needs.

### Option B — Brevo / Mailjet (free tier)

Sign up, open their **SMTP settings**, and copy the host, port, login and key
into the same four variables. Both allow sending to any address without owning
a domain.

> ⚠️ **Resend won't work** on its free tier: without a verified domain it can
> only send to your own address, so your classmates would never receive codes.

**Deliverability note:** codes are delivered to `@student.cuet.ac.bd`, a mail
server you don't control. Send yourself a test code first, and check the spam
folder if it doesn't arrive.

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
   | `SMTP_HOST`               | from Part 1 (e.g. `smtp.gmail.com`)                 |
   | `SMTP_PORT`               | from Part 1 (e.g. `587`)                            |
   | `SMTP_USER`               | from Part 1                                         |
   | `SMTP_PASSWORD`           | from Part 1                                         |
   | `SMTP_FROM`               | e.g. `CUET Expense Splitter <you@gmail.com>`        |
   | `CUET_EMAIL_REGEX`        | `^u2204[0-9]{3}@student\.cuet\.ac\.bd$`             |

   > **Important:** in `CUET_EMAIL_REGEX` use **single** backslashes (`\.`).
   > Double backslashes silently break the pattern and block every login.

   > **Email is required in production.** Without the `SMTP_*` values the app
   > refuses to send codes rather than silently dropping them — so nobody
   > could sign up.

   Optional: `INVITATION_TTL_HOURS` (default `168`),
   `RATE_LIMIT_INVITES_PER_MIN`, `RATE_LIMIT_ACCEPT_PER_MIN`.

4. Click **Deploy** and wait for the build.

   > ⚡ **Speed:** `vercel.json` pins the app to Vercel's **Singapore (`sin1`)**
   > region so the server sits next to the Supabase database. Every database
   > query then costs ~1–3 ms instead of the ~60 ms you see when running
   > locally from Bangladesh. **If you ever move the Supabase project to a
   > different region, change `regions` in `vercel.json` to match** — a
   > mismatch here is the single biggest thing that will make the site feel
   > slow.

5. Vercel gives you a URL like `https://cuet-project-expense-tracker.vercel.app`.
   **This is your shareable link.**
6. Add `AUTH_URL` in Vercel's environment variables set to your live URL
   (e.g. `https://YOUR-APP.vercel.app`), then redeploy. This helps Auth.js
   build correct sign-in redirects behind Vercel's proxy.

7. Open your live URL, create an account with your CUET email, and confirm the
   code actually arrives.

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

## Part 5 — Going live for your classmates

There is no approval step — anyone with a CUET address matching
`CUET_EMAIL_REGEX` can create an account as soon as the site is up.

Before sharing the link:

- Send yourself a code on the live site and confirm it arrives (check spam).
- Make sure `CUET_EMAIL_REGEX` covers the batches you want. The default only
  allows `u2204###`; widen it if classmates from other batches need access, e.g.
  `^u220[0-9]{4}@student\.cuet\.ac\.bd$`.
- Watch your email provider's daily send limit if many people sign up at once.

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

| Problem                                           | Fix                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code email never arrives**                      | Check the spam folder. Confirm all `SMTP_*` values are set in Vercel. Gmail requires an **App Password**, not your normal password. Try sending to a personal address first to isolate whether CUET's mail server is filtering it.              |
| "Please use your CUET student email address"      | The address doesn't match `CUET_EMAIL_REGEX`. That's the CUET restriction working as intended.                                                                                                                                                  |
| Every login is rejected, even valid ones          | Check `CUET_EMAIL_REGEX` uses **single** backslashes.                                                                                                                                                                                           |
| `Can't reach database server`                     | Check `DATABASE_URL`/`DIRECT_URL`, and that the Supabase project isn't paused (free projects pause after inactivity — open the Supabase dashboard to resume).                                                                                   |
| Build fails on Vercel with missing env            | Add the missing variable in Project Settings → Environment Variables, then redeploy.                                                                                                                                                            |
| Invitation link says invalid                      | Links expire after `INVITATION_TTL_HOURS` (default 7 days) and are single-use. Send a fresh one.                                                                                                                                                |
| **"Not found" page after signing in (local dev)** | The Turbopack cache went stale and stopped registering `/api/auth/*`. Stop the dev server, delete the `.next` folder, and run `npm run dev` again. Verify with `curl http://localhost:3000/api/auth/providers` — it must return JSON, not HTML. |

---

## Security checklist before sharing the link

- [ ] `.env` is **not** committed (verify: `git ls-files | grep "^.env$"` returns nothing)
- [ ] Production `AUTH_SECRET` and `INVITATION_TOKEN_SECRET` differ from the dev ones
- [ ] `CUET_EMAIL_REGEX` set correctly in Vercel (single backslashes)
- [ ] Supabase database password is not shared publicly
- [ ] `SMTP_PASSWORD` is an app password, not your main email password
