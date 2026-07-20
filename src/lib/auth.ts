/**
 * Auth.js (NextAuth v5) configuration — Google OpenID Connect, restricted to
 * CUET student accounts. SERVER-ONLY.
 *
 * Security model (see docs/SECURITY.md §2):
 *   - Google is configured as a full OIDC provider (`type: "oidc"`), so
 *     Auth.js's underlying `openid-client` verifies the ID token signature,
 *     issuer, audience and expiration before any of our code runs.
 *   - Our `signIn` callback re-checks `email_verified`, the CUET email regex,
 *     and (when configured) the Workspace `hd` claim, using the SAME
 *     `evaluateCuetSignIn` function that is unit-tested in tests/unit/cuet.test.ts.
 *   - Verified against the installed Auth.js source
 *     (node_modules/@auth/core/src/lib/actions/callback/index.ts): the
 *     `signIn` callback runs BEFORE any database user/account is created. If
 *     it returns `false` or a redirect string, `handleLoginOrRegister` (and
 *     therefore `createUser`) is never invoked — a rejected sign-in leaves
 *     zero trace in the database. This holds no matter what the frontend
 *     does; there is no client-side bypass.
 *   - `profile()` below adds `googleSub` (the Google `sub` claim) to the
 *     mapped user object Auth.js hands to the Prisma adapter, so the User row
 *     is created with its permanent identity key already set — there is no
 *     window where a user exists without it. Email is normalized (trimmed +
 *     lowercased) and is a unique secondary attribute, never the primary key.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { GoogleProfile } from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { evaluateCuetSignIn, normalizeEmail, type GoogleProfileLike } from "@/lib/cuet";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getEnv();

  return {
    adapter: PrismaAdapter(prisma),
    session: { strategy: "database" },
    secret: env.AUTH_SECRET,
    trustHost: true,
    pages: {
      signIn: "/login",
      error: "/login",
    },
    providers: [
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        // Carry the permanent identity key (`sub`) through to the row Prisma
        // creates. Do not use `email` as an id substitute.
        profile(profile: GoogleProfile) {
          return {
            id: profile.sub,
            googleSub: profile.sub,
            name: profile.name,
            email: normalizeEmail(profile.email),
            image: profile.picture,
          };
        },
      }),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        if (!account || account.provider !== "google" || !profile) {
          return false;
        }

        const decision = evaluateCuetSignIn(profile as GoogleProfileLike, {
          emailRegex: env.CUET_EMAIL_REGEX,
          hostedDomain: env.GOOGLE_HOSTED_DOMAIN,
        });

        if (!decision.ok) {
          // A redirect string (rather than `false`) lets /login show the
          // specific rejection reason instead of a generic error.
          return `/login?error=CuetRestricted&reason=${decision.reason}`;
        }

        return true;
      },
      async session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
        }
        return session;
      },
    },
    events: {
      // By the time this fires, `signIn` has already approved the account, so
      // `email_verified` is known true. Keep the DB flag honest for
      // observability; it is never itself the source of authorization truth
      // (every sign-in re-validates against fresh OIDC claims above).
      async signIn({ user, account, profile }) {
        if (!user.id || account?.provider !== "google" || !profile) return;
        const raw = profile as GoogleProfileLike;
        if (raw.email_verified) {
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
          });
        }
      },
    },
  };
});
