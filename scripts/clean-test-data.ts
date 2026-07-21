/**
 * Removes leftover test rows (users created by the test factories, which all
 * use a `test-` email prefix). Only needed if a test run is interrupted before
 * its cleanup hook finishes — a normal run cleans up after itself.
 *
 * Safe: it never touches real accounts, only `test-%@student.cuet.ac.bd`.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const orphans = await prisma.user.findMany({
    where: { email: { startsWith: "test-" } },
    select: { id: true, email: true },
  });

  if (orphans.length === 0) {
    console.log("No leftover test data. Nothing to clean.");
  } else {
    // Remove their projects first so cascades clear members/expenses/settlements.
    await prisma.project.deleteMany({
      where: { creatorUserId: { in: orphans.map((u) => u.id) } },
    });
    const { count } = await prisma.user.deleteMany({
      where: { id: { in: orphans.map((u) => u.id) } },
    });
    console.log(`Removed ${count} leftover test user(s).`);
  }

  await prisma.$disconnect();
}

main();
