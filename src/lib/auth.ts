/**
 * Auth.js configuration — email + password sign-in. SERVER-ONLY.
 *
 * Session strategy is **JWT**, which the Credentials provider requires (it
 * cannot use database sessions). A pleasant side effect: reading the session no
 * longer costs a database round trip on every request.
 *
 * Passwords are never inspected here — `verifyCredentials` compares them
 * against a scrypt hash in constant time and enforces the CUET-domain rule, so
 * a non-CUET address can never obtain a session.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getEnv } from "@/lib/env";
import { verifyCredentials } from "@/lib/services/account";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getEnv();

  return {
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    secret: env.AUTH_SECRET,
    trustHost: true,
    pages: { signIn: "/login", error: "/login" },
    providers: [
      Credentials({
        name: "Email and password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(raw) {
          const email = typeof raw?.email === "string" ? raw.email : "";
          const password =
            typeof raw?.password === "string" ? raw.password : "";
          if (!email || !password) return null;

          const user = await verifyCredentials(email, password);
          if (!user) return null;

          return { id: user.id, email: user.email, name: user.name };
        },
      }),
    ],
    callbacks: {
      // Keep the database id on the token so `session.user.id` is available
      // everywhere without a lookup.
      async jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.sub) {
          session.user.id = token.sub;
        }
        return session;
      },
    },
  };
});
