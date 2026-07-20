import { describe, it, expect } from "vitest";
import {
  evaluateCuetSignIn,
  isCuetEmail,
  normalizeEmail,
  type CuetAuthConfig,
  type GoogleProfileLike,
} from "@/lib/cuet";

const DEFAULT_REGEX = "^u2204[0-9]{3}@student\\.cuet\\.ac\\.bd$";
const config: CuetAuthConfig = { emailRegex: DEFAULT_REGEX };

function profile(overrides: Partial<GoogleProfileLike> = {}): GoogleProfileLike {
  return {
    sub: "google-sub-123",
    email: "u2204001@student.cuet.ac.bd",
    email_verified: true,
    ...overrides,
  };
}

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  U2204001@Student.CUET.ac.BD ")).toBe(
      "u2204001@student.cuet.ac.bd",
    );
  });
});

describe("isCuetEmail", () => {
  it("accepts valid CUET 2204-batch addresses (case-insensitive)", () => {
    expect(isCuetEmail("u2204001@student.cuet.ac.bd", DEFAULT_REGEX)).toBe(true);
    expect(isCuetEmail("U2204999@STUDENT.CUET.AC.BD", DEFAULT_REGEX)).toBe(true);
  });

  it("rejects non-matching addresses", () => {
    expect(isCuetEmail("someone@gmail.com", DEFAULT_REGEX)).toBe(false);
    expect(isCuetEmail("u2205001@student.cuet.ac.bd", DEFAULT_REGEX)).toBe(false);
    expect(isCuetEmail("u220400@student.cuet.ac.bd", DEFAULT_REGEX)).toBe(false); // too few digits
    expect(isCuetEmail("admin@cuet.ac.bd", DEFAULT_REGEX)).toBe(false);
  });
});

describe("evaluateCuetSignIn", () => {
  it("accepts a valid, verified CUET account and returns sub as identity", () => {
    const decision = evaluateCuetSignIn(profile(), config);
    expect(decision).toEqual({
      ok: true,
      googleSub: "google-sub-123",
      email: "u2204001@student.cuet.ac.bd",
    });
  });

  it("rejects a non-CUET domain (even if verified)", () => {
    const decision = evaluateCuetSignIn(
      profile({ email: "attacker@gmail.com" }),
      config,
    );
    expect(decision).toEqual({ ok: false, reason: "domain_not_allowed" });
  });

  it("rejects an unverified email", () => {
    const decision = evaluateCuetSignIn(
      profile({ email_verified: false }),
      config,
    );
    expect(decision).toEqual({ ok: false, reason: "email_unverified" });
  });

  it("rejects a missing sub / missing email", () => {
    expect(evaluateCuetSignIn(profile({ sub: null }), config)).toEqual({
      ok: false,
      reason: "missing_sub",
    });
    expect(evaluateCuetSignIn(profile({ email: null }), config)).toEqual({
      ok: false,
      reason: "missing_email",
    });
  });

  it("enforces hosted domain when configured and present", () => {
    const withHd: CuetAuthConfig = {
      emailRegex: DEFAULT_REGEX,
      hostedDomain: "student.cuet.ac.bd",
    };
    expect(
      evaluateCuetSignIn(profile({ hd: "gmail.com" }), withHd),
    ).toEqual({ ok: false, reason: "hosted_domain_mismatch" });
    expect(
      evaluateCuetSignIn(profile({ hd: "student.cuet.ac.bd" }), withHd).ok,
    ).toBe(true);
  });

  it("ignores hosted domain when the profile has no hd claim", () => {
    const withHd: CuetAuthConfig = {
      emailRegex: DEFAULT_REGEX,
      hostedDomain: "student.cuet.ac.bd",
    };
    expect(evaluateCuetSignIn(profile({ hd: null }), withHd).ok).toBe(true);
  });

  it("supports a reconfigured regex (rules are environment-driven)", () => {
    const altConfig: CuetAuthConfig = {
      emailRegex: "^u21[0-9]{5}@student\\.cuet\\.ac\\.bd$",
    };
    expect(
      evaluateCuetSignIn(
        profile({ email: "u2100123@student.cuet.ac.bd" }),
        altConfig,
      ).ok,
    ).toBe(true);
    expect(evaluateCuetSignIn(profile(), altConfig).ok).toBe(false); // 2204 no longer matches
  });
});
