# Authorization — CUET Expense Splitter

Authorization is enforced **server-side on every read and mutation** through
reusable policy functions in `src/lib/policy/`. The frontend hiding a button is
never the control; it is only UX.

## 1. Principals

| Principal               | Definition                                              |
| ----------------------- | ------------------------------------------------------- |
| Unauthenticated visitor | No valid session                                        |
| Authenticated CUET user | Valid session, CUET email, **not** a member of project  |
| Invited (not accepted)  | Has a PENDING invitation matching their email           |
| Ordinary member         | Active `ProjectMember`, not leader                      |
| Leader                  | Active member and `project.leaderMemberId == member.id` |
| Creator                 | `project.creatorUserId == user.id` (also a member)      |

Creator is also a member and may or may not currently be leader. Creator retains
invite + transfer-leadership rights even if leadership was transferred away.

## 2. Authorization matrix

Legend: ✅ allowed · ❌ denied · ⚠️ conditional (see notes).

| Operation           | Unauth | CUET (non-member) | Invited (unaccepted) | Member | Leader | Creator |
| ------------------- | :----: | :---------------: | :------------------: | :----: | :----: | :-----: |
| View project        |   ❌   |        ❌         |          ❌          |   ✅   |   ✅   |   ✅    |
| View expenses       |   ❌   |        ❌         |          ❌          |   ✅   |   ✅   |   ✅    |
| Add expense (self)  |   ❌   |        ❌         |          ❌          |   ✅   |   ✅   |   ✅    |
| Edit expense        |   ❌   |        ❌         |          ❌          |  ⚠️¹   |  ⚠️¹   |   ⚠️¹   |
| Delete expense      |   ❌   |        ❌         |          ❌          |  ⚠️¹   |  ⚠️¹   |   ⚠️¹   |
| Invite member       |   ❌   |        ❌         |          ❌          |   ❌   |   ✅   |   ✅    |
| Rename project      |   ❌   |        ❌         |          ❌          |   ❌   |   ✅   |   ⚠️²   |
| Transfer leadership |   ❌   |        ❌         |          ❌          |   ❌   |  ⚠️³   |   ✅    |
| Settle cycle        |   ❌   |        ❌         |          ❌          |   ❌   |   ✅   |   ⚠️²   |
| Delete project      |   ❌   |        ❌         |          ❌          |   ❌   |   ✅   |   ⚠️²   |
| Accept invitation   |   ❌   |        ⚠️⁴        |         ⚠️⁴          |   —    |   —    |    —    |

**Notes**

1. **Edit/Delete expense** allowed only when: the caller is the **payer** of
   that expense **and** the expense is **unsettled** (`settlementId IS NULL`).
   No one — including leader/creator — may edit another member's expense, and
   settled expenses are locked for everyone.
2. **Creator** performs rename/settle/delete **only while currently leader**.
   Rename/settle/delete are _leader_ powers; the creator holds them because the
   creator is usually the leader. If leadership was transferred away, the
   creator must transfer it back (its standing right) before renaming/settling/
   deleting. Invite and transfer-leadership are the creator's _always-on_ rights.
3. **Leader** may transfer leadership only to an **active member** of the same
   project (and not to themselves as a no-op error).
4. **Accept invitation** allowed only when the authenticated user's
   **verified email exactly matches** the invitation's email, the invitation is
   **PENDING** and **not expired**, and the user is not already an active member.

## 3. Policy functions (server)

Located in `src/lib/policy/project-policy.ts` (pure, unit-tested). Each returns
a discriminated result or throws `AuthorizationError`.

```ts
loadContext(userId, projectId): Promise<ProjectContext>
  // { project, membership|null, isCreator, isLeader } — single source of truth

assertMember(ctx): void
assertLeader(ctx): void
assertLeaderOrCreatorLeader(ctx): void   // leader powers
assertCreator(ctx): void
canEditExpense(ctx, expense): boolean    // payer && unsettled
assertCanEditExpense(ctx, expense): void
assertCanInvite(ctx): void               // leader || creator
assertCanTransferLeadership(ctx): void    // leader || creator
assertCanAcceptInvitation(user, invitation): void  // email match + valid
```

Every Server Action / Route Handler calls `loadContext` first, then the
relevant `assert*`. A missing membership yields **404** (not 403) for
project-scoped reads so project existence isn't leaked to non-members (IDOR
hardening): "not found" is returned whether the project doesn't exist or the
caller simply can't see it.

## 4. IDOR & privacy guarantees

- Never trust `projectId` from the client without `loadContext` + membership.
- Guessing another project's id returns 404.
- Realtime: Supabase RLS policy mirrors `assertMember`; a client cannot
  subscribe to `project:{id}` without an active membership row.
- Invitation lists returned to a leader expose only that project's invitations,
  never unrelated users.
- Accepting an invitation addressed to another email is rejected server-side
  even if the token is known.

## 5. Mass-assignment protection

- Server Actions accept only Zod-validated DTOs; `payerUserId`, `projectId`,
  `settlementId`, role fields are **never** taken from client input on
  update — they are derived from the session/context or immutable.

## 6. Future: membership removal (documented, not in v1)

Removing a member after expenses exist is unsafe because their expenses and
share participation are baked into cycle math and settlement snapshots. A safe
future design: introduce `status = LEFT/REMOVED` with an effective date, exclude
inactive members from **future** cycles only, keep them in historical
settlement snapshots, and require the current cycle to be settled (or the
member to have zero unsettled expenses) before deactivation. See
`docs/PRD.md` §4 and `DATABASE.md` §3.
