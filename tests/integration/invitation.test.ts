/**
 * Integration tests against the REAL configured database (see
 * tests/factories/index.ts).
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/services/project";
import {
  createInvitation,
  acceptInvitation,
  listPendingInvitations,
  listInvitationsForUser,
  getInvitationPreview,
} from "@/lib/services/invitation";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { createTestUser } from "../factories";

describe("invitations (integration)", () => {
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

  it("the leader can invite a CUET email and gets a one-time plaintext token", async () => {
    const leader = await user();
    const p = await project(leader.id);

    const { invitation, plaintextToken } = await createInvitation(
      leader.id,
      p.id,
      "u2204999@student.cuet.ac.bd",
    );

    expect(invitation.status).toBe("PENDING");
    expect(invitation.email).toBe("u2204999@student.cuet.ac.bd");
    expect(plaintextToken.length).toBeGreaterThan(20);
    // Only the hash is stored — never the plaintext.
    expect(invitation.tokenHash).not.toBe(plaintextToken);

    const preview = await getInvitationPreview(plaintextToken);
    expect(preview?.projectName).toBe(p.name);
  });

  it("an ordinary member cannot invite (leader/creator only)", async () => {
    const leader = await user();
    const member = await user();
    const p = await project(leader.id);
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: member.id },
    });

    await expect(
      createInvitation(member.id, p.id, "u2204111@student.cuet.ac.bd"),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects inviting a non-CUET email", async () => {
    const leader = await user();
    const p = await project(leader.id);

    await expect(
      createInvitation(leader.id, p.id, "notacuetstudent@gmail.com"),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects inviting an existing active member", async () => {
    const leader = await user();
    // A CUET-format email so the invite passes the domain check and reaches
    // the "already a member" check.
    const existing = await user({ email: "u2204010@student.cuet.ac.bd" });
    const p = await project(leader.id);
    await prisma.projectMember.create({
      data: { projectId: p.id, userId: existing.id },
    });

    await expect(
      createInvitation(leader.id, p.id, existing.email),
    ).rejects.toThrow(ConflictError);
  });

  it("[required test #6] a duplicate PENDING invitation for the same email is blocked", async () => {
    const leader = await user();
    const p = await project(leader.id);

    await createInvitation(leader.id, p.id, "u2204222@student.cuet.ac.bd");
    await expect(
      createInvitation(leader.id, p.id, "u2204222@student.cuet.ac.bd"),
    ).rejects.toThrow(ConflictError);
  });

  it("[required test #5] accepting with a different verified email than invited is rejected", async () => {
    const leader = await user();
    const invitedEmail = "u2204333@student.cuet.ac.bd";
    const p = await project(leader.id);
    const { plaintextToken } = await createInvitation(leader.id, p.id, invitedEmail);

    const wrongUser = await user({ email: "u2204444@student.cuet.ac.bd" });

    await expect(
      acceptInvitation(wrongUser.id, wrongUser.email, plaintextToken),
    ).rejects.toThrow(AuthorizationError);

    // And they must NOT have been added as a member.
    const membership = await prisma.projectMember.findUnique({
      where: { uniq_project_user: { projectId: p.id, userId: wrongUser.id } },
    });
    expect(membership).toBeNull();
  });

  it("the invited user (matching email) can accept and becomes an active member", async () => {
    const leader = await user();
    const invitee = await user({ email: "u2204555@student.cuet.ac.bd" });
    const p = await project(leader.id);
    const { plaintextToken } = await createInvitation(
      leader.id,
      p.id,
      invitee.email,
    );

    const result = await acceptInvitation(invitee.id, invitee.email, plaintextToken);
    expect(result.projectId).toBe(p.id);

    const membership = await prisma.projectMember.findUnique({
      where: { uniq_project_user: { projectId: p.id, userId: invitee.id } },
    });
    expect(membership?.status).toBe("ACTIVE");

    const updatedInvitation = await prisma.projectInvitation.findFirst({
      where: { projectId: p.id, email: invitee.email },
    });
    expect(updatedInvitation?.status).toBe("ACCEPTED");
    expect(updatedInvitation?.acceptedByUserId).toBe(invitee.id);
  });

  it("accepting the same invitation twice fails the second time", async () => {
    const leader = await user();
    const invitee = await user({ email: "u2204666@student.cuet.ac.bd" });
    const p = await project(leader.id);
    const { plaintextToken } = await createInvitation(
      leader.id,
      p.id,
      invitee.email,
    );

    await acceptInvitation(invitee.id, invitee.email, plaintextToken);
    await expect(
      acceptInvitation(invitee.id, invitee.email, plaintextToken),
    ).rejects.toThrow(ConflictError);
  });

  it("an invalid/unknown token is rejected without leaking details", async () => {
    const someone = await user();
    await expect(
      acceptInvitation(someone.id, someone.email, "not-a-real-token"),
    ).rejects.toThrow(NotFoundError);
    expect(await getInvitationPreview("not-a-real-token")).toBeNull();
  });

  it("listPendingInvitations is scoped to one project and leader/creator only", async () => {
    const leader = await user();
    const otherLeader = await user();
    const p1 = await project(leader.id, "Project One");
    const p2 = await project(otherLeader.id, "Project Two");

    await createInvitation(leader.id, p1.id, "u2204777@student.cuet.ac.bd");
    await createInvitation(otherLeader.id, p2.id, "u2204888@student.cuet.ac.bd");

    const p1Invitations = await listPendingInvitations(leader.id, p1.id);
    expect(p1Invitations).toHaveLength(1);
    expect(p1Invitations[0].email).toBe("u2204777@student.cuet.ac.bd");

    // A non-leader/creator (not even a member) cannot list them.
    const outsider = await user();
    await expect(listPendingInvitations(outsider.id, p1.id)).rejects.toThrow();
  });

  it("listInvitationsForUser only returns invitations for the caller's own email", async () => {
    const leader = await user();
    const p = await project(leader.id);
    const targetEmail = "u2204999@student.cuet.ac.bd";
    await createInvitation(leader.id, p.id, targetEmail);

    const forTarget = await listInvitationsForUser(targetEmail);
    expect(forTarget.some((i) => i.projectId === p.id)).toBe(true);

    const forSomeoneElse = await listInvitationsForUser(
      "u2200001@student.cuet.ac.bd",
    );
    expect(forSomeoneElse.some((i) => i.projectId === p.id)).toBe(false);
  });
});
