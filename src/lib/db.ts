// Prisma client singleton.
//
// SERVER-ONLY: this module reads DATABASE_URL and opens a connection pool. Never
// import it from a Client Component. (We avoid the `server-only` package because
// it breaks importing this module under Vitest; the boundary is enforced by
// convention + code review — see CLAUDE.md.)
//
// Prisma 7 has no bundled query engine; the connection is provided by the pg
// driver adapter.
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse one instance across HMR reloads in development to avoid exhausting the
// database connection pool.
export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (getEnv().NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
