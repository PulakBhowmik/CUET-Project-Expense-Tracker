/**
 * Invitation token hashing (port + default adapter — see docs/ARCHITECTURE.md
 * §9). Only the HASH is ever stored in the database; the plaintext token is
 * shown to the inviter exactly once at creation time and is never persisted
 * (docs/SECURITY.md §5).
 */
import { createHmac, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

export interface TokenHasher {
  generateToken(): string;
  hashToken(token: string): string;
}

export function createHmacTokenHasher(secret: string): TokenHasher {
  return {
    generateToken: () => randomBytes(32).toString("base64url"),
    hashToken: (token: string) =>
      createHmac("sha256", secret).update(token).digest("hex"),
  };
}

let singleton: TokenHasher | null = null;

export function getTokenHasher(): TokenHasher {
  if (!singleton) {
    singleton = createHmacTokenHasher(getEnv().INVITATION_TOKEN_SECRET);
  }
  return singleton;
}
