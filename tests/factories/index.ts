/**
 * Test factories for integration tests. These write to the REAL configured
 * database (Supabase — see docs/IMPLEMENTATION_PLAN.md's simplification note:
 * no separate local test DB). Every test that uses these must clean up what
 * it created; see `cleanupProject` / `cleanupUser` and the `afterEach` pattern
 * used in tests/integration/*.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { User } from "@/generated/prisma/client";

export async function createTestUser(
  overrides: Partial<{ name: string; email: string }> = {},
): Promise<User> {
  const suffix = randomUUID().slice(0, 12);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `test-${suffix}@student.cuet.ac.bd`,
      name: overrides.name ?? `Test User ${suffix}`,
      emailVerified: new Date(),
      // A placeholder hash: these users never sign in through the UI.
      passwordHash: "scrypt$16384$8$1$00$00",
    },
  });
}

/**
 * Deletes a project and everything that references it. Safe to call even if
 * the project was already deleted by the test itself.
 */
export async function cleanupProject(projectId: string): Promise<void> {
  await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
}

/** Must run AFTER cleanupProject for any project the user created/joined. */
export async function cleanupUser(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}
