/**
 * One-time email codes.
 *
 * Security properties (docs/SECURITY.md):
 *   - The code is emailed once and **only its HMAC hash is stored**, so a
 *     database leak does not reveal usable codes.
 *   - Codes expire quickly (default 10 minutes).
 *   - A code is single-use: consuming it stamps `consumedAt`.
 *   - Failed attempts are capped per code; sends are rate-limited per email.
 *   - Verification failures are deliberately indistinguishable (wrong code vs.
 *     expired vs. no code) so an attacker learns nothing.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isCuetEmail, normalizeEmail } from "@/lib/cuet";
import { ValidationError, RateLimitError } from "@/lib/errors";
import type { OtpPurpose } from "@/generated/prisma/enums";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** Most codes that may be requested for one address within the window. */
export const OTP_MAX_SENDS_PER_WINDOW = 5;
export const OTP_SEND_WINDOW_MINUTES = 15;
/** Minimum gap between two code requests for the same address. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

const CODE_LENGTH = 6;

function hashCode(email: string, code: string): string {
  // Keyed with the app secret and bound to the email so a hash can't be
  // replayed for a different address.
  return createHmac("sha256", getEnv().INVITATION_TOKEN_SECRET)
    .update(`${email}:${code}`)
    .digest("hex");
}

function generateCode(): string {
  // Cryptographically random 6-digit code, zero-padded.
  return randomInt(0, 10 ** CODE_LENGTH)
    .toString()
    .padStart(CODE_LENGTH, "0");
}

export interface IssuedOtp {
  email: string;
  code: string;
  expiresAt: Date;
}

/**
 * Create a code for an email. Returns the PLAINTEXT code so the caller can
 * email it — it is never persisted or logged in production.
 */
export async function issueOtp(
  rawEmail: string,
  purpose: OtpPurpose,
): Promise<IssuedOtp> {
  const email = normalizeEmail(rawEmail);

  if (!isCuetEmail(email, getEnv().CUET_EMAIL_REGEX)) {
    throw new ValidationError(
      "Please use your CUET student email address.",
    );
  }

  const now = new Date();
  const windowStart = new Date(
    now.getTime() - OTP_SEND_WINDOW_MINUTES * 60 * 1000,
  );

  const recent = await prisma.emailOtp.findMany({
    where: { email, purpose, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recent.length >= OTP_MAX_SENDS_PER_WINDOW) {
    throw new RateLimitError(
      "Too many codes requested. Please wait a few minutes and try again.",
    );
  }
  const last = recent[0];
  if (
    last &&
    now.getTime() - last.createdAt.getTime() <
      OTP_RESEND_COOLDOWN_SECONDS * 1000
  ) {
    throw new RateLimitError(
      `Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
    );
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  // Any earlier unconsumed code for this address+purpose becomes invalid.
  await prisma.$transaction([
    prisma.emailOtp.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.emailOtp.create({
      data: { email, codeHash: hashCode(email, code), purpose, expiresAt },
    }),
  ]);

  return { email, code, expiresAt };
}

/**
 * Check a code WITHOUT consuming it (used to advance the sign-up UI to the
 * password step). Counts a failed attempt on mismatch.
 */
export async function checkOtp(
  rawEmail: string,
  code: string,
  purpose: OtpPurpose,
): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const record = await prisma.emailOtp.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return false;
  if (record.expiresAt.getTime() <= Date.now()) return false;
  if (record.attempts >= OTP_MAX_ATTEMPTS) return false;

  const provided = Buffer.from(hashCode(email, code.trim()), "hex");
  const expected = Buffer.from(record.codeHash, "hex");
  const ok =
    provided.length === expected.length && timingSafeEqual(provided, expected);

  if (!ok) {
    await prisma.emailOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }
  return true;
}

/**
 * Verify AND consume a code. Returns true only once per code; a replay of the
 * same code afterwards fails.
 */
export async function consumeOtp(
  rawEmail: string,
  code: string,
  purpose: OtpPurpose,
): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const ok = await checkOtp(email, code, purpose);
  if (!ok) return false;

  // Consume conditionally so two concurrent requests can't both succeed.
  const result = await prisma.emailOtp.updateMany({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return result.count > 0;
}
