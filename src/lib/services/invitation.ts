/**
 * Invitation service. Invitations are delivered as a shareable link (no email
 * service) — see docs/IMPLEMENTATION_PLAN.md's Phase 4 note. The plaintext
 * token is returned ONLY from `createInvitation`, never stored or re-derivable
 * afterward; only its hash lives in the database (docs/SECURITY.md §5).
 */
import { prisma } from "@/lib/db";
import {
  loadProjectContext,
  assertCanInvite,
} from "@/lib/policy/project-policy";
import { isCuetEmail, normalizeEmail } from "@/lib/cuet";
import { getEnv } from "@/lib/env";
import { getTokenHasher } from "@/lib/token-hasher";
import { getInviteRateLimiter, getAcceptRateLimiter } from "@/lib/rate-limit";
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  AuthorizationError,
} from "@/lib/errors";
import type { ProjectInvitation } from "@/generated/prisma/client";

function isUniqueConstraintError(err: unknown): boolean {
  // Prisma translates any Postgres unique_violation (SQLSTATE 23505) into
  // P2002, including constraints created via raw-SQL migration (like our
  // partial unique index on pending invitations) that aren't in the Prisma
  // schema's own DMMF.
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export interface CreateInvitationResult {
  invitation: ProjectInvitation;
  plaintextToken: string;
}

export async function createInvitation(
  actorUserId: string,
  projectId: string,
  rawEmail: string,
): Promise<CreateInvitationResult> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertCanInvite(ctx);

  const rl = getInviteRateLimiter().consume(actorUserId);
  if (!rl.allowed) {
    throw new RateLimitError(
      "You're sending invites too quickly. Please wait a moment and try again.",
    );
  }

  const email = normalizeEmail(rawEmail);
  const env = getEnv();
  if (!isCuetEmail(email, env.CUET_EMAIL_REGEX)) {
    throw new ValidationError(
      "Only CUET student email addresses can be invited.",
    );
  }

  const existingMember = await prisma.projectMember.findFirst({
    where: { projectId, status: "ACTIVE", user: { email } },
  });
  if (existingMember) {
    throw new ConflictError("This person is already a member of the project.");
  }

  const hasher = getTokenHasher();
  const plaintextToken = hasher.generateToken();
  const tokenHash = hasher.hashToken(plaintextToken);
  const expiresAt = new Date(
    Date.now() + env.INVITATION_TTL_HOURS * 60 * 60 * 1000,
  );

  let invitation: ProjectInvitation;
  try {
    invitation = await prisma.$transaction(async (tx) => {
      const created = await tx.projectInvitation.create({
        data: {
          projectId,
          email,
          tokenHash,
          invitedByUserId: actorUserId,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          projectId,
          actorUserId,
          action: "INVITATION_CREATED",
          targetType: "ProjectInvitation",
          targetId: created.id,
          metadata: { email },
        },
      });
      return created;
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError(
        "There is already a pending invitation for this email.",
      );
    }
    throw err;
  }

  return { invitation, plaintextToken };
}

/** Leader/creator-only: invitations for ONE project, never unrelated users. */
export async function listPendingInvitations(
  actorUserId: string,
  projectId: string,
): Promise<ProjectInvitation[]> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertCanInvite(ctx);

  return prisma.projectInvitation.findMany({
    where: { projectId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

export interface UserInvitationSummary {
  id: string;
  projectId: string;
  projectName: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Invitations addressed to the CURRENTLY authenticated user's own verified
 * email — never accepts an arbitrary email from client input, so this can
 * never expose another user's invitations.
 */
export async function listInvitationsForUser(
  userEmail: string,
): Promise<UserInvitationSummary[]> {
  const email = normalizeEmail(userEmail);
  const invitations = await prisma.projectInvitation.findMany({
    where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return invitations.map((inv) => ({
    id: inv.id,
    projectId: inv.project.id,
    projectName: inv.project.name,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
  }));
}

export interface InvitationPreview {
  projectName: string;
  email: string;
  expiresAt: Date;
}

/** Safe to call unauthenticated. Returns null for any invalid/expired/non-pending token. */
export async function getInvitationPreview(
  token: string,
): Promise<InvitationPreview | null> {
  const tokenHash = getTokenHasher().hashToken(token);
  const invitation = await prisma.projectInvitation.findUnique({
    where: { tokenHash },
    include: { project: { select: { name: true } } },
  });
  if (!invitation) return null;
  if (invitation.status !== "PENDING") return null;
  if (invitation.expiresAt.getTime() < Date.now()) return null;

  return {
    projectName: invitation.project.name,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
  };
}

export async function acceptInvitation(
  userId: string,
  userEmail: string,
  token: string,
): Promise<{ projectId: string }> {
  const rl = getAcceptRateLimiter().consume(userId);
  if (!rl.allowed) {
    throw new RateLimitError(
      "Too many attempts. Please wait a moment and try again.",
    );
  }

  const tokenHash = getTokenHasher().hashToken(token);
  const invitation = await prisma.projectInvitation.findUnique({
    where: { tokenHash },
  });
  if (!invitation) {
    throw new NotFoundError("This invitation link is invalid.");
  }
  if (invitation.status === "ACCEPTED") {
    throw new ConflictError("This invitation has already been used.");
  }
  if (invitation.status === "REVOKED") {
    throw new ConflictError("This invitation is no longer valid.");
  }
  if (
    invitation.status === "EXPIRED" ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    throw new ConflictError("This invitation has expired.");
  }

  // The single most important check: only the invited email may accept.
  if (normalizeEmail(userEmail) !== invitation.email) {
    throw new AuthorizationError(
      "This invitation was sent to a different email address. Sign in with the invited CUET account to accept it.",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.projectMember.create({
        data: { projectId: invitation.projectId, userId },
      });
      await tx.projectInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedByUserId: userId,
        },
      });
      await tx.auditLog.create({
        data: {
          projectId: invitation.projectId,
          actorUserId: userId,
          action: "INVITATION_ACCEPTED",
          targetType: "ProjectInvitation",
          targetId: invitation.id,
        },
      });
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError("You are already a member of this project.");
    }
    throw err;
  }

  return { projectId: invitation.projectId };
}
