/**
 * Integration tests against the REAL configured database.
 * Covers the one-time-code and password sign-in security properties.
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  issueOtp,
  checkOtp,
  consumeOtp,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_WINDOW,
} from "@/lib/services/otp";
import {
  completeSignup,
  verifyCredentials,
  hasAccount,
} from "@/lib/services/account";
import { ValidationError, RateLimitError } from "@/lib/errors";

// The CUET pattern allows u2204 + exactly 3 digits; use a distinct one per test.
const E = (n: string) => `u2204${n}@student.cuet.ac.bd`;

describe("email one-time codes (integration)", () => {
  const emails: string[] = [];

  afterEach(async () => {
    for (const email of emails.splice(0)) {
      await prisma.emailOtp.deleteMany({ where: { email } });
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  function track(email: string) {
    emails.push(email);
    return email;
  }
  /** Bypass the resend cooldown for tests that need several codes. */
  async function ageOutCooldown(email: string) {
    await prisma.emailOtp.updateMany({
      where: { email },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
    });
  }

  it("stores only a HASH of the code, never the code itself", async () => {
    const email = track(E("300"));
    const { code } = await issueOtp(email, "SIGNUP");

    const rows = await prisma.emailOtp.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).not.toBe(code);
    expect(rows[0].codeHash).not.toContain(code);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("accepts the correct code and rejects a wrong one", async () => {
    const email = track(E("301"));
    const { code } = await issueOtp(email, "SIGNUP");

    expect(await checkOtp(email, "000000" === code ? "111111" : "000000", "SIGNUP")).toBe(false);
    expect(await checkOtp(email, code, "SIGNUP")).toBe(true);
  });

  it("rejects a code issued for a different purpose", async () => {
    const email = track(E("302"));
    const { code } = await issueOtp(email, "SIGNUP");
    expect(await checkOtp(email, code, "PASSWORD_RESET")).toBe(false);
  });

  it("is single-use: the same code cannot be consumed twice", async () => {
    const email = track(E("303"));
    const { code } = await issueOtp(email, "SIGNUP");

    expect(await consumeOtp(email, code, "SIGNUP")).toBe(true);
    expect(await consumeOtp(email, code, "SIGNUP")).toBe(false);
  });

  it("rejects an expired code", async () => {
    const email = track(E("304"));
    const { code } = await issueOtp(email, "SIGNUP");
    await prisma.emailOtp.updateMany({
      where: { email },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await checkOtp(email, code, "SIGNUP")).toBe(false);
  });

  it("locks the code after too many wrong attempts", async () => {
    const email = track(E("305"));
    const { code } = await issueOtp(email, "SIGNUP");

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await checkOtp(email, "999999" === code ? "888888" : "999999", "SIGNUP");
    }
    // Even the CORRECT code no longer works once attempts are exhausted.
    expect(await checkOtp(email, code, "SIGNUP")).toBe(false);
  });

  it("invalidates an older code when a new one is issued", async () => {
    const email = track(E("306"));
    const first = await issueOtp(email, "SIGNUP");
    await ageOutCooldown(email);
    const second = await issueOtp(email, "SIGNUP");

    expect(await checkOtp(email, first.code, "SIGNUP")).toBe(false);
    expect(await checkOtp(email, second.code, "SIGNUP")).toBe(true);
  });

  it("rate-limits repeated code requests", async () => {
    const email = track(E("307"));
    for (let i = 0; i < OTP_MAX_SENDS_PER_WINDOW; i++) {
      await issueOtp(email, "SIGNUP");
      await ageOutCooldown(email);
    }
    await expect(issueOtp(email, "SIGNUP")).rejects.toThrow(RateLimitError);
  });

  it("enforces a short cooldown between requests", async () => {
    const email = track(E("308"));
    await issueOtp(email, "SIGNUP");
    await expect(issueOtp(email, "SIGNUP")).rejects.toThrow(RateLimitError);
  });

  it("refuses to issue a code to a non-CUET address", async () => {
    await expect(issueOtp("someone@gmail.com", "SIGNUP")).rejects.toThrow(
      ValidationError,
    );
  });
});

describe("account creation & password sign-in (integration)", () => {
  const emails: string[] = [];

  afterEach(async () => {
    for (const email of emails.splice(0)) {
      await prisma.emailOtp.deleteMany({ where: { email } });
      await prisma.user.deleteMany({ where: { email } });
    }
  });
  function track(email: string) {
    emails.push(email);
    return email;
  }

  it("creates the account and signs in with the chosen password", async () => {
    const email = track(E("310"));
    const { code } = await issueOtp(email, "SIGNUP");

    const user = await completeSignup(email, code, "correct horse", "SIGNUP");
    expect(user.email).toBe(email);

    const ok = await verifyCredentials(email, "correct horse");
    expect(ok?.id).toBe(user.id);
    expect(await hasAccount(email)).toBe(true);
  });

  it("never stores the password in plain text", async () => {
    const email = track(E("311"));
    const { code } = await issueOtp(email, "SIGNUP");
    await completeSignup(email, code, "PlainTextSecret1", "SIGNUP");

    const row = await prisma.user.findUnique({ where: { email } });
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toContain("PlainTextSecret1");
    expect(row?.passwordHash?.startsWith("scrypt$")).toBe(true);
  });

  it("rejects a wrong password and an unknown account identically (null)", async () => {
    const email = track(E("312"));
    const { code } = await issueOtp(email, "SIGNUP");
    await completeSignup(email, code, "the right one", "SIGNUP");

    expect(await verifyCredentials(email, "the wrong one")).toBeNull();
    expect(await verifyCredentials(E("399"), "anything")).toBeNull();
  });

  it("refuses to set a password without a valid code", async () => {
    const email = track(E("313"));
    await expect(
      completeSignup(email, "000000", "some password", "SIGNUP"),
    ).rejects.toThrow(ValidationError);

    const row = await prisma.user.findUnique({ where: { email } });
    expect(row).toBeNull(); // no account was created
  });

  it("marks the email as verified once the code is used", async () => {
    const email = track(E("314"));
    const { code } = await issueOtp(email, "SIGNUP");
    await completeSignup(email, code, "another password", "SIGNUP");

    const row = await prisma.user.findUnique({ where: { email } });
    expect(row?.emailVerified).toBeInstanceOf(Date);
  });

  it("a password reset keeps the same account (and its projects)", async () => {
    const email = track(E("315"));
    const first = await issueOtp(email, "SIGNUP");
    const created = await completeSignup(email, first.code, "old password", "SIGNUP");

    await prisma.emailOtp.updateMany({
      where: { email },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
    });
    const reset = await issueOtp(email, "PASSWORD_RESET");
    const same = await completeSignup(
      email,
      reset.code,
      "brand new password",
      "PASSWORD_RESET",
    );

    expect(same.id).toBe(created.id); // same account, not a duplicate
    expect(await verifyCredentials(email, "brand new password")).not.toBeNull();
    expect(await verifyCredentials(email, "old password")).toBeNull();
  });

  it("rejects sign-in for a non-CUET address even with a password", async () => {
    expect(await verifyCredentials("attacker@gmail.com", "whatever")).toBeNull();
  });
});
