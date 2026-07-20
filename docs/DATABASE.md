# Database Design — CUET Expense Splitter

PostgreSQL + Prisma. Money stored as **integer paisa** (`BigInt`). All identity
uses Google `sub`, not email.

## 1. Entities & relationships (overview)

```
User 1───N ProjectMember N───1 Project
User 1───N Account/Session            (Auth.js)
Project 1───N ProjectMember
Project 1───N ProjectInvitation
Project 1───N Expense
Project 1───N Settlement
Project 1  ──1 leader (ProjectMember)  (Project.leaderMemberId)
Project 1  ──1 creator (User)          (Project.creatorUserId, immutable)
Settlement 1───N SettlementBalance
Settlement 1───N Expense               (Expense.settlementId, nullable)
* 1───N AuditLog
```

## 2. Prisma schema (authoritative)

```prisma
// datasource + generator omitted here; see prisma/schema.prisma

enum ProjectMemberStatus {
  ACTIVE
  // future: REMOVED, LEFT (see membership-changes future work)
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}

enum SettlementStatus {
  PENDING
  COMPLETE
}

enum AuditAction {
  PROJECT_CREATED
  PROJECT_RENAMED
  PROJECT_DELETED
  LEADERSHIP_TRANSFERRED
  INVITATION_CREATED
  INVITATION_ACCEPTED
  INVITATION_REVOKED
  EXPENSE_CREATED
  EXPENSE_UPDATED
  EXPENSE_DELETED
  SETTLEMENT_COMPLETED
}

model User {
  id            String   @id @default(cuid())
  googleSub     String   @unique                 // permanent identity key
  email         String   @unique                 // normalized lowercase
  emailVerified DateTime?
  name          String?
  image         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  accounts        Account[]
  sessions        Session[]
  memberships     ProjectMember[]
  createdProjects Project[]         @relation("ProjectCreator")
  expenses        Expense[]
  auditLogs       AuditLog[]

  @@index([email])
}

// --- Auth.js models (Account, Session, VerificationToken) ---
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

model Project {
  id             String   @id @default(cuid())
  name           String
  creatorUserId  String                          // immutable creator
  leaderMemberId String?  @unique                 // current leader (a member)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  creator      User            @relation("ProjectCreator", fields: [creatorUserId], references: [id])
  leaderMember ProjectMember?  @relation("ProjectLeader", fields: [leaderMemberId], references: [id])
  members      ProjectMember[] @relation("ProjectMembers")
  invitations  ProjectInvitation[]
  expenses     Expense[]
  settlements  Settlement[]

  @@index([creatorUserId])
}

model ProjectMember {
  id        String              @id @default(cuid())
  projectId String
  userId    String
  status    ProjectMemberStatus @default(ACTIVE)
  joinedAt  DateTime            @default(now())

  project Project @relation("ProjectMembers", fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id])
  leadingProject Project? @relation("ProjectLeader")

  // Only ONE active membership per (project,user). Partial unique in migration.
  @@unique([projectId, userId], name: "uniq_project_user")
  @@index([userId])
  @@index([projectId, status])
}

model ProjectInvitation {
  id           String           @id @default(cuid())
  projectId    String
  email         String           // normalized lowercase, CUET-validated
  tokenHash    String   @unique  // hash only, never plaintext
  status       InvitationStatus @default(PENDING)
  invitedByUserId String
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  acceptedAt   DateTime?
  acceptedByUserId String?

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Prevent duplicate PENDING invitations per (project,email): partial unique
  // index WHERE status='PENDING' created in raw migration.
  @@index([projectId, status])
  @@index([email])
  @@index([expiresAt])
}

model Expense {
  id           String   @id @default(cuid())
  projectId    String
  payerUserId  String                            // immutable after creation
  title        String
  description  String?
  amountPaisa  BigInt                             // > 0, enforced by CHECK
  expenseDate  DateTime @db.Date
  settlementId String?                            // null = unsettled/current
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  project    Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  payer      User        @relation(fields: [payerUserId], references: [id])
  settlement Settlement? @relation(fields: [settlementId], references: [id])

  @@index([projectId, settlementId])   // unsettled-cycle queries
  @@index([projectId, payerUserId])
  @@index([settlementId])
}

model Settlement {
  id             String           @id @default(cuid())
  projectId      String
  status         SettlementStatus @default(PENDING)
  idempotencyKey String
  cycleTotalPaisa BigInt
  activeMemberCount Int
  equalSharePaisa  BigInt
  createdByUserId String
  createdAt      DateTime @default(now())
  completedAt    DateTime?

  project  Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  balances SettlementBalance[]
  expenses Expense[]

  // Idempotency: same key cannot create two settlements for a project.
  @@unique([projectId, idempotencyKey], name: "uniq_project_idempotency")
  @@index([projectId, createdAt])
}

model SettlementBalance {
  id             String   @id @default(cuid())
  settlementId   String
  userId         String
  paidPaisa      BigInt
  sharePaisa     BigInt
  netBalancePaisa BigInt   // paid - share (can be negative)

  settlement Settlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)

  @@unique([settlementId, userId])
  @@index([settlementId])
}

model AuditLog {
  id          String      @id @default(cuid())
  projectId   String?
  actorUserId String?
  action      AuditAction
  targetType  String?
  targetId    String?
  metadata    Json?
  createdAt   DateTime    @default(now())

  actor User? @relation(fields: [actorUserId], references: [id])

  @@index([projectId, createdAt])
  @@index([actorUserId])
}
```

## 3. Constraints requiring raw SQL migration steps

Prisma can't express all of these declaratively, so a follow-up SQL migration
adds:

1. **Positive amount**:
   `ALTER TABLE "Expense" ADD CONSTRAINT expense_amount_positive CHECK ("amountPaisa" > 0);`
2. **One PENDING invitation per (project,email)**:
   `CREATE UNIQUE INDEX uniq_pending_invite ON "ProjectInvitation" ("projectId","email") WHERE status = 'PENDING';`
3. **One active membership per (project,user)** — the `@@unique([projectId,userId])`
   already enforces one row; when `REMOVED`/`LEFT` are introduced, switch to a
   partial unique `WHERE status = 'ACTIVE'`.
4. **Settlement snapshot integrity**: `SettlementBalance.netBalancePaisa`
   check `= paidPaisa - sharePaisa` (application-enforced + optional CHECK).
5. **Leader is a member of the same project**: enforced in application/service
   layer (transfer validates target membership) — cross-row FK not expressible;
   documented and unit-tested.

## 4. Money & calculation rules

- `amountPaisa: BigInt` — 1 BDT = 100 paisa. Never float.
- **Equal share**: `share = floor(cycleTotal / n)`. Remainder
  `r = cycleTotal - share*n` distributed one paisa each to the first `r`
  members ordered by `userId` ascending → **deterministic**.
- Per member: `net = paid - share_i` where `share_i` includes any remainder
  paisa assigned to that member. Sum of all `share_i == cycleTotal`, and sum of
  all `net == 0` (invariant, unit-tested).

## 5. Totals (no mutable denormalized source-of-truth)

- **Lifetime total** = `SELECT COALESCE(SUM(amountPaisa),0) FROM Expense WHERE projectId=?`.
- **Current-cycle total** = same with `settlementId IS NULL`.
- Computed by authoritative aggregation. If a cached summary is later added it
  must be maintained inside the same transaction as the mutation (documented,
  not required for v1).

## 6. Double-settlement prevention

- Settlement runs in a transaction that (a) takes a row lock on the project
  (`SELECT ... FOR UPDATE` via a lock row / advisory lock), (b) selects
  unsettled expenses `FOR UPDATE`, (c) sets their `settlementId` only where it is
  still NULL. Two concurrent settlements: the second finds no unsettled rows (or
  the idempotency unique index rejects it) → no double settlement.

## 7. Indexes (why)

| Index                                   | Purpose                          |
| --------------------------------------- | -------------------------------- |
| `User.googleSub unique`                 | identity lookup on login         |
| `User.email unique`                     | normalized email uniqueness      |
| `ProjectMember (projectId,userId) uniq` | membership check / no duplicates |
| `ProjectMember (projectId,status)`      | active-member listing            |
| `Expense (projectId,settlementId)`      | current-cycle & lifetime queries |
| `Expense (projectId,payerUserId)`       | per-payer queries                |
| `ProjectInvitation (projectId,status)`  | pending invitation lookups       |
| `ProjectInvitation.tokenHash unique`    | accept-by-token                  |
| `Settlement (projectId,idempotencyKey)` | idempotent settlement            |
