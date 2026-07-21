/**
 * Account service: request a code, verify it, set a password, and sign in.
 *
 * Ownership of a CUET address is proven by a one-time emailed code before any
 * password can be set — so nobody can claim an address they don't control.
 */
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isCuetEmail, normalizeEmail } from "@/lib/cuet";
import { hashPassword, verifyPassword } from "@/lib/password";
import { issueOtp, checkOtp, consumeOtp, OTP_TTL_MINUTES } from "@/lib/services/otp";
import { getMailer, buildOtpEmail } from "@/lib/mailer";
import { ValidationError } from "@/lib/errors";
import type { OtpPurpose } from "@/generated/prisma/enums";

function assertCuet(email: string): string {
  const normalized = normalizeEmail(email);
  if (!isCuetEmail(normalized, getEnv().CUET_EMAIL_REGEX)) {
    throw new ValidationError("Please use your CUET student email address.");
  }
  return normalized;
}

/** Generate a code and email it. */
export async function requestCode(
  rawEmail: string,
  purpose: OtpPurpose,
): Promise<{ email: string }> {
  const email = assertCuet(rawEmail);

  // For a password reset there must be an account; we still return normally
  // either way so the response can't be used to discover who has an account.
  if (purpose === "PASSWORD_RESET") {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) return { email };
  }

  const { code } = await issueOtp(email, purpose);
  const message = buildOtpEmail(code, OTP_TTL_MINUTES);
  await getMailer().send({ ...message, to: email });

  return { email };
}

/** Check a code without consuming it (advances the UI to the password step). */
export async function verifyCode(
  rawEmail: string,
  code: string,
  purpose: OtpPurpose,
): Promise<boolean> {
  const email = assertCuet(rawEmail);
  return checkOtp(email, code, purpose);
}

/**
 * Consume the code and set the password. Creates the account if it doesn't
 * exist; otherwise updates the password on the existing account (so users who
 * already had an account keep their projects).
 */
export async function completeSignup(
  rawEmail: string,
  code: string,
  password: string,
  purpose: OtpPurpose,
): Promise<{ id: string; email: string }> {
  const email = assertCuet(rawEmail);

  const ok = await consumeOtp(email, code, purpose);
  if (!ok) {
    throw new ValidationError(
      "That code is invalid or has expired. Please request a new one.",
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, emailVerified: new Date() },
    update: { passwordHash, emailVerified: new Date() },
    select: { id: true, email: true },
  });

  return user;
}

/**
 * Verify sign-in credentials. Returns null for every failure — a wrong
 * password and an unknown address are indistinguishable to the caller.
 */
export async function verifyCredentials(
  rawEmail: string,
  password: string,
): Promise<{ id: string; email: string; name: string | null } | null> {
  const email = normalizeEmail(rawEmail);
  if (!isCuetEmail(email, getEnv().CUET_EMAIL_REGEX)) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  // Hash even when the user is missing so the response time doesn't reveal
  // whether the address exists.
  const stored =
    user?.passwordHash ??
    "scrypt$16384$8$1$00000000000000000000000000000000$00";
  const valid = await verifyPassword(password, stored);

  if (!user || !user.passwordHash || !valid) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/** Whether an address already has a usable password (drives the UI copy). */
export async function hasAccount(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true },
  });
  return !!user?.passwordHash;
}
