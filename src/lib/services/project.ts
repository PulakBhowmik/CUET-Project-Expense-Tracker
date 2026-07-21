/**
 * Project service: creation, authorized reads, and the leader/creator
 * management operations (rename, transfer leadership, delete).
 */
import { prisma } from "@/lib/db";
import {
  loadProjectContext,
  assertLeaderPower,
  assertCanTransferLeadership,
  type ProjectContext,
} from "@/lib/policy/project-policy";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Project } from "@/generated/prisma/client";

export interface CreateProjectInput {
  name: string;
}

/**
 * Create a project. The creator becomes the immutable creator, the first
 * leader, and an active member — all in one transaction, so a project can
 * never exist without its creator being a member and leader (docs/PRD.md §5.2).
 */
export async function createProject(
  creatorUserId: string,
  input: CreateProjectInput,
): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { name: input.name, creatorUserId },
    });

    const member = await tx.projectMember.create({
      data: { projectId: project.id, userId: creatorUserId },
    });

    return tx.project.update({
      where: { id: project.id },
      data: { leaderMemberId: member.id },
    });
  });
}

export interface ProjectSummary {
  project: Project;
  memberCount: number;
  isCreator: boolean;
  isLeader: boolean;
}

/**
 * Projects the user created or is an active member of, newest first. The
 * creator is always also a member (guaranteed by `createProject`), so callers
 * partition this single list by `isCreator` instead of running two queries.
 */
export async function listProjectsForUser(
  userId: string,
): Promise<ProjectSummary[]> {
  const memberships = await prisma.projectMember.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      project: {
        include: {
          _count: { select: { members: { where: { status: "ACTIVE" } } } },
        },
      },
    },
    orderBy: { project: { createdAt: "desc" } },
  });

  return memberships.map((m) => ({
    project: m.project,
    memberCount: m.project._count.members,
    isCreator: m.project.creatorUserId === userId,
    isLeader: m.project.leaderMemberId === m.id,
  }));
}

export interface ProjectMemberSummary {
  id: string;
  userId: string;
  name: string | null;
  email: string;
}

export type ProjectDetail = ProjectContext & {
  members: ProjectMemberSummary[];
};

/** Load a single project the user is authorized to view (throws NotFoundError otherwise). */
export async function getProjectForUser(
  userId: string,
  projectId: string,
): Promise<ProjectDetail> {
  const ctx = await loadProjectContext(userId, projectId);

  const members = await prisma.projectMember.findMany({
    where: { projectId, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return {
    ...ctx,
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
    })),
  };
}

/** Rename a project. Leader power (docs/AUTHORIZATION.md). */
export async function renameProject(
  actorUserId: string,
  projectId: string,
  name: string,
): Promise<Project> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertLeaderPower(ctx);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { name },
    });
    await tx.auditLog.create({
      data: {
        projectId,
        actorUserId,
        action: "PROJECT_RENAMED",
        targetType: "Project",
        targetId: projectId,
        metadata: { from: ctx.project.name, to: name },
      },
    });
    return updated;
  });
}

/**
 * Transfer leadership to another ACTIVE member. Allowed for the current leader
 * or the (immutable) creator. Exactly one leader exists at any time because
 * `Project.leaderMemberId` is a single unique column.
 */
export async function transferLeadership(
  actorUserId: string,
  projectId: string,
  targetUserId: string,
): Promise<Project> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertCanTransferLeadership(ctx);

  const target = await prisma.projectMember.findUnique({
    where: { uniq_project_user: { projectId, userId: targetUserId } },
  });
  if (!target || target.status !== "ACTIVE") {
    throw new NotFoundError("That member is not part of this project.");
  }
  if (ctx.project.leaderMemberId === target.id) {
    throw new ConflictError("That member is already the leader.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { leaderMemberId: target.id },
    });
    await tx.auditLog.create({
      data: {
        projectId,
        actorUserId,
        action: "LEADERSHIP_TRANSFERRED",
        targetType: "ProjectMember",
        targetId: target.id,
        metadata: {
          fromMemberId: ctx.project.leaderMemberId,
          toUserId: targetUserId,
        },
      },
    });
    return updated;
  });
}

/**
 * Delete a project. Leader power, and the caller must type the exact project
 * name as confirmation (re-validated server-side, never trusted from the UI).
 * Cascades remove members, invitations, expenses and settlements.
 */
export async function deleteProject(
  actorUserId: string,
  projectId: string,
  confirmationName: string,
): Promise<void> {
  const ctx = await loadProjectContext(actorUserId, projectId);
  assertLeaderPower(ctx);

  if (confirmationName.trim() !== ctx.project.name) {
    throw new ValidationError(
      "The name you typed doesn't match the project name.",
    );
  }

  // Audit first: the project row (and its cascade) disappears on delete, so the
  // log entry deliberately keeps no FK to it.
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: "PROJECT_DELETED",
      targetType: "Project",
      targetId: projectId,
      metadata: { name: ctx.project.name },
    },
  });
  await prisma.project.delete({ where: { id: projectId } });
}
