/**
 * Integration tests against the REAL configured database (see
 * tests/factories/index.ts). These prove authorization and membership rules
 * hold against actual Postgres constraints, not mocks.
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createProject,
  listProjectsForUser,
  getProjectForUser,
} from "@/lib/services/project";
import { loadProjectContext } from "@/lib/policy/project-policy";
import { NotFoundError } from "@/lib/errors";
import { createTestUser } from "../factories";

describe("project creation & membership authorization (integration)", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  afterEach(async () => {
    // Projects must be deleted before their users (FK ordering).
    for (const id of createdProjectIds.splice(0)) {
      await prisma.project.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUserIds.splice(0)) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  async function user(overrides?: Partial<{ name: string; email: string }>) {
    const u = await createTestUser(overrides);
    createdUserIds.push(u.id);
    return u;
  }

  async function project(creatorId: string, name = "Test Project") {
    const p = await createProject(creatorId, { name });
    createdProjectIds.push(p.id);
    return p;
  }

  it("creating a project makes the creator both leader and an active member", async () => {
    const creator = await user();
    const p = await project(creator.id, "Robotics Club");

    expect(p.creatorUserId).toBe(creator.id);
    expect(p.leaderMemberId).not.toBeNull();

    const membership = await prisma.projectMember.findUnique({
      where: { uniq_project_user: { projectId: p.id, userId: creator.id } },
    });
    expect(membership).not.toBeNull();
    expect(membership!.status).toBe("ACTIVE");
    expect(p.leaderMemberId).toBe(membership!.id);
  });

  it("[required test #4] a non-member cannot load the project (IDOR -> NotFoundError)", async () => {
    const creator = await user();
    const outsider = await user();
    const p = await project(creator.id, "Private Project");

    await expect(loadProjectContext(outsider.id, p.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("a nonexistent project id yields the SAME error as a non-member (no existence leak)", async () => {
    const someone = await user();
    await expect(
      loadProjectContext(someone.id, "definitely-not-a-real-id"),
    ).rejects.toThrow(NotFoundError);
  });

  it("a member can load the project and sees accurate context", async () => {
    const creator = await user();
    const p = await project(creator.id, "Team Project");

    const detail = await getProjectForUser(creator.id, p.id);
    expect(detail.isCreator).toBe(true);
    expect(detail.isLeader).toBe(true);
    expect(detail.members).toHaveLength(1);
    expect(detail.members[0].userId).toBe(creator.id);
  });

  it("[required test #7] duplicate membership is blocked by the database", async () => {
    const creator = await user();
    const p = await project(creator.id, "Dup Test");

    await expect(
      prisma.projectMember.create({
        data: { projectId: p.id, userId: creator.id },
      }),
    ).rejects.toThrow();
  });

  it("listProjectsForUser partitions correctly via isCreator, and memberCount is accurate", async () => {
    const creator = await user();
    const other = await user();
    const p = await project(creator.id, "Shared Project");
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: other.id },
    });

    const creatorView = await listProjectsForUser(creator.id);
    const otherView = await listProjectsForUser(other.id);

    const inCreatorView = creatorView.find((x) => x.project.id === p.id);
    const inOtherView = otherView.find((x) => x.project.id === p.id);

    expect(inCreatorView?.isCreator).toBe(true);
    expect(inCreatorView?.isLeader).toBe(true);
    expect(inOtherView?.isCreator).toBe(false);
    expect(inOtherView?.isLeader).toBe(false);
    expect(inOtherView?.memberCount).toBe(2);
  });

  it("a project never exists without its creator as an active leader-member", async () => {
    const creator = await user();
    const p = await project(creator.id);

    const membership = await prisma.projectMember.findUnique({
      where: { uniq_project_user: { projectId: p.id, userId: creator.id } },
    });
    expect(membership?.status).toBe("ACTIVE");
    expect(p.leaderMemberId).toBe(membership?.id);
  });
});
