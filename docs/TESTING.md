# Manual Testing Guide — CUET Expense Splitter

The automated suite (`npm test`) already proves the money math, permissions, and
settlement safety. This guide is for **you** to confirm the app feels right and
works end to end in a real browser.

Tick each box as you go. Anything that doesn't match the "Expected" column is a
bug worth reporting.

---

## Before you start

**You'll need two accounts** to test invitations and splitting properly.

The app only accepts emails matching `CUET_EMAIL_REGEX`
(default `^u2204[0-9]{3}@student\.cuet\.ac\.bd$`). Two options:

- **Best:** use your own CUET account plus a real classmate's.
- **Easier for solo testing:** temporarily widen the pattern to also allow your
  Gmail accounts, e.g. in `.env`:
  ```
  CUET_EMAIL_REGEX="^(u2204[0-9]{3}@student\.cuet\.ac\.bd|yourname(\+[a-z0-9]+)?@gmail\.com)$"
  ```
  Gmail treats `yourname+test1@gmail.com` as the same inbox, so one Gmail
  account gives you many identities. **Change it back before sharing the app.**

Run locally with `npm run dev` → <http://localhost:3000>, or use your Vercel
link.

---

## 1. Login & CUET restriction

| #   | Step                                                                          | Expected                                                           |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1.1 | Visit `/dashboard` while signed out                                           | Redirected to the login page                                       |
| 1.2 | Sign in with a **valid CUET** Google account                                  | Lands on the dashboard, your name/email shown                      |
| 1.3 | Sign out, then sign in with a **non-CUET** Google account (e.g. random Gmail) | Rejected with a "not eligible" message — **no account is created** |
| 1.4 | Visit `/projects/new` while signed out                                        | Redirected to login                                                |

> 1.3 is the important one — it proves outsiders can't get in even though Google
> authenticated them successfully.

---

## 2. Creating a project

| #   | Step                                                | Expected                                        |
| --- | --------------------------------------------------- | ----------------------------------------------- |
| 2.1 | Dashboard → **New project**, name it `Test Project` | Project created, you're taken to it             |
| 2.2 | Look at the project header                          | You are listed as **Leader**; members = 1 (you) |
| 2.3 | Try a 1-character name                              | Rejected with a validation message              |
| 2.4 | Go back to the dashboard                            | The project appears in your list                |

---

## 3. Expenses (single user)

| #    | Step                                                        | Expected                                                                                        |
| ---- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 3.1  | Add expense: purpose `Printing`, amount `100`, today's date | Appears in the table as ৳100.00                                                                 |
| 3.2  | Check the balance panel                                     | Current-cycle total ৳100.00; your share ৳100.00; **"You are settled"** (you're the only member) |
| 3.3  | Add amount `12.50`                                          | Accepted, shows ৳12.50                                                                          |
| 3.4  | Try amount `0`                                              | Rejected — "greater than zero"                                                                  |
| 3.5  | Try amount `-5`                                             | Rejected                                                                                        |
| 3.6  | Try amount `abc`                                            | Rejected                                                                                        |
| 3.7  | Try amount `10.999`                                         | Rejected (more than 2 decimals)                                                                 |
| 3.8  | Edit one of your expenses, change amount to `250`           | Updates; totals recalculate                                                                     |
| 3.9  | Delete an expense                                           | Row disappears; totals recalculate                                                              |
| 3.10 | Try a future date                                           | Rejected                                                                                        |

---

## 4. Invitations (needs your second account)

| #   | Step                                                                 | Expected                                                                                  |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 4.1 | As leader, invite your second email                                  | An invite **link** is shown — copy it                                                     |
| 4.2 | Invite the _same_ email again                                        | Rejected — duplicate pending invitation                                                   |
| 4.3 | Invite a **non-CUET** email                                          | Rejected — only CUET addresses                                                            |
| 4.4 | Open the invite link while signed out                                | Asked to sign in first                                                                    |
| 4.5 | Open the invite link signed in as the **wrong** account (the leader) | **Blocked** — says it was sent to a different address. This is the critical privacy check |
| 4.6 | Open the invite link as the **correct** second account → Accept      | Joins the project, sees it on their dashboard                                             |
| 4.7 | Open the same link again                                             | Says already used / invalid                                                               |
| 4.8 | Make up a random token, e.g. `/invitations/abc123`                   | Invalid invitation message (no crash, no data leak)                                       |

---

## 5. Privacy between projects (IDOR) — important

| #   | Step                                                         | Expected                                                                           |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 5.1 | As account A, copy your project URL (`/projects/<id>`)       | —                                                                                  |
| 5.2 | Sign in as account B who is **not** a member, paste that URL | **"Not found"** page — not a permission error. B must not learn the project exists |
| 5.3 | As B, check the dashboard                                    | A's project is not listed anywhere                                                 |

---

## 6. Expense ownership rules — important

With both accounts in the same project, each having added an expense:

| #   | Step                                          | Expected                                                          |
| --- | --------------------------------------------- | ----------------------------------------------------------------- |
| 6.1 | As member B, look at A's expense row          | **No Edit/Delete buttons** — only yours have them                 |
| 6.2 | As the **leader**, look at member B's expense | Also no Edit/Delete — leaders can't touch others' expenses either |
| 6.3 | As B, edit your own expense                   | Works                                                             |

---

## 7. The equal split — the money math

Set up: **4 members**, and **one member pays ৳100** (delete other expenses so the
cycle total is exactly ৳100).

| #   | Check                          | Expected                        |
| --- | ------------------------------ | ------------------------------- |
| 7.1 | Current-cycle total            | ৳100.00                         |
| 7.2 | Your equal share (each member) | ৳25.00                          |
| 7.3 | The payer's balance            | **"You should receive ৳75.00"** |
| 7.4 | Each other member's balance    | **"You owe ৳25.00"**            |

Remainder check: change the expense to **৳100.01** with 3 members
(total 10001 paisa ÷ 3). Shares should be ৳33.34 / ৳33.34 / ৳33.33 — they must
**add up to exactly ৳100.01**, never ৳100.00 or ৳100.02.

---

## 8. Live updates

| #   | Step                                                                                       | Expected                                                                             |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 8.1 | Open the project in two browsers (or one normal + one incognito), signed in as two members | Both show the project                                                                |
| 8.2 | Add an expense in window 1                                                                 | Within ~10 seconds window 2 shows it **without refreshing**, and its balances update |
| 8.3 | Watch the "Live" indicator                                                                 | Green pulsing dot                                                                    |
| 8.4 | Turn off wifi briefly                                                                      | Indicator switches to "Offline", then recovers                                       |

---

## 9. Settlement — leader only

| #    | Step                                                                            | Expected                                                                          |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 9.1  | As an **ordinary member**, look for the settle button                           | Not shown                                                                         |
| 9.2  | As **leader** with unsettled expenses, click **Mark current expenses as split** | Modal shows total, member count, equal share, and each member's paid/share/result |
| 9.3  | Review the numbers                                                              | They match section 7                                                              |
| 9.4  | Confirm                                                                         | Settlement completes                                                              |
| 9.5  | Check the balance panel                                                         | Current-cycle total **৳0.00**, everyone "settled"                                 |
| 9.6  | Check the lifetime total                                                        | **Unchanged** — still includes the settled money                                  |
| 9.7  | Check the expense table                                                         | Old expenses now marked **Settled**                                               |
| 9.8  | Try to edit or delete a settled expense                                         | **No buttons** — it's locked forever                                              |
| 9.9  | Check settlement history                                                        | Shows the record with each member's paid/share/result                             |
| 9.10 | Click the settle button again with nothing new                                  | **Disabled**                                                                      |
| 9.11 | Add a new expense                                                               | Starts a fresh cycle; lifetime total grows                                        |

---

## 10. Settings, leadership & deletion

| #    | Step                                                                     | Expected                                                               |
| ---- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 10.1 | As an ordinary member, open `/projects/<id>/settings`                    | "Only the project leader can manage settings"                          |
| 10.2 | As leader, rename the project                                            | Name updates everywhere                                                |
| 10.3 | Transfer leadership to the other member                                  | They become Leader; you no longer see leader-only controls             |
| 10.4 | As the **creator** (even after giving leadership away), transfer it back | Works — creator keeps that right                                       |
| 10.5 | As leader, go to Danger zone → type the **wrong** name → Delete          | Rejected — name doesn't match                                          |
| 10.6 | Type the **exact** name → Delete                                         | Project deleted, back to dashboard, gone from both members' dashboards |

---

## 11. Mobile & accessibility

| #    | Step                                            | Expected                                                                                      |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 11.1 | Open on a phone (or DevTools mobile view)       | Layout readable, no horizontal scrolling of the page; wide tables scroll inside their own box |
| 11.2 | Navigate the add-expense form with **Tab** only | Every field reachable, focus clearly visible                                                  |
| 11.3 | Submit a form with an error                     | Error message is announced/visible near the form                                              |

---

## 12. Error handling

| #    | Step                                                 | Expected                                                    |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------- |
| 12.1 | Visit a nonsense URL like `/projects/does-not-exist` | Clean "Not found" page                                      |
| 12.2 | Any error message anywhere                           | Plain English — never a database error, stack trace, or SQL |

---

## Reporting a problem

If something fails, note: **which step number**, what you saw vs. expected, and
whether you were the leader/member/creator. That's enough to pinpoint it.
