/**
 * Quick database health check. Run with: npm run db:check
 * Connects via the RUNTIME pooler (DATABASE_URL, :6543) and confirms the schema
 * and custom constraints are in place.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const tables = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public'`;
    const check = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'expense_amount_positive'`;
    const idx = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE indexname = 'uniq_pending_invite'`;
    const userCount = await prisma.user.count();

    console.log("Connected to Supabase via runtime pooler (:6543)");
    console.log(`  public tables:              ${tables[0].n}`);
    console.log(`  positive-amount CHECK:      ${check.length === 1 ? "present" : "MISSING"}`);
    console.log(`  pending-invite unique idx:  ${idx.length === 1 ? "present" : "MISSING"}`);
    console.log(`  user rows:                  ${userCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("DB check failed:", e);
    process.exit(1);
  });
