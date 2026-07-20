import { describe, it, expect } from "vitest";
import { parseEnv } from "@/lib/env";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/cuet_expense",
  AUTH_SECRET: "test-secret",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  INVITATION_TOKEN_SECRET: "invite-secret",
};

describe("parseEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    const env = parseEnv(validEnv);
    expect(env.DATABASE_URL).toContain("postgresql://");
    // Defaults
    expect(env.CUET_EMAIL_REGEX).toBe(
      "^u2204[0-9]{3}@student\\.cuet\\.ac\\.bd$",
    );
    expect(env.INVITATION_TTL_HOURS).toBe(168);
    expect(env.FEATURE_APP_OTP).toBe(false);
    expect(env.RATE_LIMIT_INVITES_PER_MIN).toBe(10);
  });

  it("coerces numeric and boolean env strings", () => {
    const env = parseEnv({
      ...validEnv,
      INVITATION_TTL_HOURS: "48",
      FEATURE_APP_OTP: "true",
    });
    expect(env.INVITATION_TTL_HOURS).toBe(48);
    expect(env.FEATURE_APP_OTP).toBe(true);
  });

  it("rejects a missing required secret", () => {
    const { AUTH_SECRET: _omit, ...withoutSecret } = validEnv;
    expect(() => parseEnv(withoutSecret)).toThrowError(/AUTH_SECRET/);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, DATABASE_URL: "mysql://localhost/db" }),
    ).toThrowError(/PostgreSQL/);
  });

  it("rejects an invalid CUET_EMAIL_REGEX", () => {
    expect(() =>
      parseEnv({ ...validEnv, CUET_EMAIL_REGEX: "([" }),
    ).toThrowError(/regular expression/);
  });
});
