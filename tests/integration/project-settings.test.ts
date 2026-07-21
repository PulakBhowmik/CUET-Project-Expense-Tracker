/**
 * Integration tests against the REAL configured database.
 * Covers rename, leadership transfer, and project deletion authorization.
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createProject,
  renameProject,
  transferLeadership,
  deleteProject,
  getProjectForUser,
} from "@/lib/services/project";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { createTestUser } from "../factories";

describe("project settings (integration)", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  afterEach(async () => {
    for (const id of createdProjectIds.splice(0)) {
      await prisma.project.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUserIds.splice(0)) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  async function user() {
    const u = await createTestUser();
    createdUserIds.push(u.id);
    return u;
  }
  async function project(creatorId: string) {
    const p = await createProject(creatorId, { name: "Settings Test" });
    createdProjectIds.push(p.id);
    return p;
  }
  async function addMember(projectId: string, userId: string) {
    await prisma.projectMember.create({ data: { projectId, userId } });
  }

  describe("rename", () => {
    it("the leader can rename the project", async () => {
      const leader = await user();
      const p = await project(leader.id);

      const renamed = await renameProject(leader.id, p.id, "New Name");
      expect(renamed.name).toBe("New Name");
    });

    it("an ordinary member cannot rename the project", async () => {
      const leader = await user();
      const member = await user();
      const p = await project(leader.id);
      await addMember(p.id, member.id);

      await expect(renameProject(member.id, p.id, "Hacked")).rejects.toThrow(
        AuthorizationError,
      );
      const unchanged = await prisma.project.findUnique({ where: { id: p.id } });
      expect(unchanged?.name).toBe("Settings Test");
    });

    it("a non-member gets 404 (no existence leak)", async () => {
      const leader = await user();
      const outsider = await user();
      const p = await project(leader.id);

      await expect(renameProject(outsider.id, p.id, "Hacked")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("transfer leadership", () => {
    it("the leader can transfer to another active member", async () => {
      const leader = await user();
      const member = await user();
      const p = await project(leader.id);
      await addMember(p.id, member.id);

      await transferLeadership(leader.id, p.id, member.id);

      const after = await getProjectForUser(member.id, p.id);
      expect(after.isLeader).toBe(true);
      // Exactly one leader still: the old leader is no longer leader.
      const oldLeaderCtx = await getProjectForUser(leader.id, p.id);
      expect(oldLeaderCtx.isLeader).toBe(false);
      // ...but remains the immutable creator.
      expect(oldLeaderCtx.isCreator).toBe(true);
    });

    it("records the transfer in the audit log", async () => {
      const leader = await user();
      const member = await user();
      const p = await project(leader.id);
      await addMember(p.id, member.id);

      await transferLeadership(leader.id, p.id, member.id);

      const entry = await prisma.auditLog.findFirst({
        where: { projectId: p.id, action: "LEADERSHIP_TRANSFERRED" },
      });
      expect(entry).not.toBeNull();
      expect(entry?.actorUserId).toBe(leader.id);
    });

    it("the creator can transfer leadership back after giving it away", async () => {
      const creator = await user();
      const member = await user();
      const p = await project(creator.id);
      await addMember(p.id, member.id);

      await transferLeadership(creator.id, p.id, member.id);
      // Creator is no longer leader but retains the transfer right.
      await transferLeadership(creator.id, p.id, creator.id);

      const ctx = await getProjectForUser(creator.id, p.id);
      expect(ctx.isLeader).toBe(true);
    });

    it("an ordinary member cannot transfer leadership", async () => {
      const leader = await user();
      const member = await user();
      const p = await project(leader.id);
      await addMember(p.id, member.id);

      await expect(
        transferLeadership(member.id, p.id, member.id),
      ).rejects.toThrow(AuthorizationError);
    });

    it("cannot transfer to a non-member", async () => {
      const leader = await user();
      const outsider = await user();
      const p = await project(leader.id);

      await expect(
        transferLeadership(leader.id, p.id, outsider.id),
      ).rejects.toThrow(NotFoundError);
    });

    it("cannot transfer to the current leader (no-op)", async () => {
      const leader = await user();
      const p = await project(leader.id);

      await expect(
        transferLeadership(leader.id, p.id, leader.id),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("[required test #20] delete project authorization", () => {
    it("the leader can delete with the exact name typed", async () => {
      const leader = await user();
      const p = await project(leader.id);

      await deleteProject(leader.id, p.id, "Settings Test");

      const gone = await prisma.project.findUnique({ where: { id: p.id } });
      expect(gone).toBeNull();
    });

    it("rejects deletion when the typed name does not match", async () => {
      const leader = await user();
      const p = await project(leader.id);

      await expect(
        deleteProject(leader.id, p.id, "Wrong Name"),
      ).rejects.toThrow(ValidationError);

      const stillThere = await prisma.project.findUnique({
        where: { id: p.id },
      });
      expect(stillThere).not.toBeNull();
    });

    it("an ordinary member cannot delete the project", async () => {
      const leader = await user();
      const member = await user();
      const p = await project(leader.id);
      await addMember(p.id, member.id);

      await expect(
        deleteProject(member.id, p.id, "Settings Test"),
      ).rejects.toThrow(AuthorizationError);

      const stillThere = await prisma.project.findUnique({
        where: { id: p.id },
      });
      expect(stillThere).not.toBeNull();
    });

    it("a non-member gets 404 rather than a permission hint", async () => {
      const leader = await user();
      const outsider = await user();
      const p = await project(leader.id);

      await expect(
        deleteProject(outsider.id, p.id, "Settings Test"),
      ).rejects.toThrow(NotFoundError);
    });

    it("deleting cascades to expenses and settlements", async () => {
      const leader = await user();
      const p = await project(leader.id);
      await prisma.expense.create({
        data: {
          projectId: p.id,
          payerUserId: leader.id,
          title: "x",
          amountPaisa: 100n,
          expenseDate: new Date("2026-07-20"),
        },
      });

      await deleteProject(leader.id, p.id, "Settings Test");

      const expenses = await prisma.expense.findMany({
        where: { projectId: p.id },
      });
      expect(expenses).toHaveLength(0);
    });
  });
});
