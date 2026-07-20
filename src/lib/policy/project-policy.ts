/**
 * Server-side authorization policy for projects. See docs/AUTHORIZATION.md for
 * the full matrix. Every read or write of project data must go through
 * `loadProjectContext` first — never trust a client-supplied projectId or role
 * claim directly.
 */
import { prisma } from "@/lib/db";
import { NotFoundError, AuthorizationError, ConflictError } from "@/lib/errors";
import type { Project, ProjectMember, Expense } from "@/generated/prisma/client";

export interface ProjectContext {
  userId: string;
  project: Project;
  membership: ProjectMember;
  isCreator: boolean;
  isLeader: boolean;
}

/**
 * Load the authorization context for (userId, projectId).
 *
 * Throws `NotFoundError` both when the project doesn't exist AND when the
 * user isn't an active member — these two cases are deliberately
 * indistinguishable to callers so a project's mere existence is never leaked
 * to non-members (IDOR hardening; docs/AUTHORIZATION.md §4).
 */
export async function loadProjectContext(
  userId: string,
  projectId: string,
): Promise<ProjectContext> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new NotFoundError("Project not found.");
  }

  const membership = await prisma.projectMember.findUnique({
    where: { uniq_project_user: { projectId, userId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    throw new NotFoundError("Project not found.");
  }

  return {
    userId,
    project,
    membership,
    isCreator: project.creatorUserId === userId,
    isLeader: project.leaderMemberId === membership.id,
  };
}

export function assertMember(ctx: ProjectContext): void {
  if (!ctx.membership || ctx.membership.status !== "ACTIVE") {
    throw new AuthorizationError("You are not a member of this project.");
  }
}

/** Leader-only powers: rename, settle, delete. */
export function assertLeaderPower(ctx: ProjectContext): void {
  if (ctx.isLeader) return;
  throw new AuthorizationError("Only the project leader can do that.");
}

/** Invite is a leader power, plus the creator's standing right (see notes in docs/AUTHORIZATION.md). */
export function assertCanInvite(ctx: ProjectContext): void {
  if (ctx.isLeader || ctx.isCreator) return;
  throw new AuthorizationError(
    "Only the leader or creator can invite members.",
  );
}

export function assertCanTransferLeadership(ctx: ProjectContext): void {
  if (ctx.isLeader || ctx.isCreator) return;
  throw new AuthorizationError(
    "Only the leader or creator can transfer leadership.",
  );
}

/** True only for the payer of an UNSETTLED expense. */
export function canModifyExpense(ctx: ProjectContext, expense: Expense): boolean {
  return expense.payerUserId === ctx.userId && expense.settlementId === null;
}

/**
 * Guards edit/delete of an expense. Settled expenses are locked for EVERYONE
 * (including leader/creator); an unsettled expense can only be touched by its
 * own payer. See docs/AUTHORIZATION.md note 1.
 */
export function assertCanModifyExpense(
  ctx: ProjectContext,
  expense: Expense,
): void {
  if (expense.settlementId !== null) {
    throw new ConflictError(
      "This expense has been settled and can no longer be changed.",
    );
  }
  if (expense.payerUserId !== ctx.userId) {
    throw new AuthorizationError("You can only change your own expenses.");
  }
}
