/**
 * Project service: creation and authorized reads. Mutations that change
 * membership/roles (invite, transfer leadership, rename, delete) land in
 * later phases.
 */
import { prisma } from "@/lib/db";
import { loadProjectContext, type ProjectContext } from "@/lib/policy/project-policy";
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

export type ProjectDetail = ProjectContext & { members: ProjectMemberSummary[] };

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
