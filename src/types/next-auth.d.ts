import type { DefaultSession } from "next-auth";

/**
 * Module augmentation for Auth.js types.
 *
 * - `Session.user.id` exposes our internal cuid (never the Google `sub`
 *   directly) to server code via `auth()`.
 * - `User.googleSub` lets the Google provider's `profile()` mapping (see
 *   src/lib/auth.ts) pass the permanent identity key through to
 *   `PrismaAdapter.createUser`, which persists whatever fields it receives.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    googleSub?: string;
  }
}
