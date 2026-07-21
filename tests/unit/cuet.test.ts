import { describe, it, expect } from "vitest";
import { isCuetEmail, normalizeEmail } from "@/lib/cuet";

const DEFAULT_REGEX = "^u2204[0-9]{3}@student\\.cuet\\.ac\\.bd$";

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
    expect(isCuetEmail("  u2204092@student.cuet.ac.bd  ", DEFAULT_REGEX)).toBe(
      true,
    );
  });

  it("rejects non-matching addresses", () => {
    expect(isCuetEmail("someone@gmail.com", DEFAULT_REGEX)).toBe(false);
    expect(isCuetEmail("u2205001@student.cuet.ac.bd", DEFAULT_REGEX)).toBe(
      false,
    );
    expect(isCuetEmail("u220400@student.cuet.ac.bd", DEFAULT_REGEX)).toBe(false);
    expect(isCuetEmail("u22040012@student.cuet.ac.bd", DEFAULT_REGEX)).toBe(
      false,
    );
    expect(isCuetEmail("admin@cuet.ac.bd", DEFAULT_REGEX)).toBe(false);
    expect(
      isCuetEmail("u2204001@student.cuet.ac.bd.evil.com", DEFAULT_REGEX),
    ).toBe(false);
  });

  it("honours a reconfigured pattern (the rule is environment-driven)", () => {
    const altRegex = "^u21[0-9]{5}@student\\.cuet\\.ac\\.bd$";
    expect(isCuetEmail("u2100123@student.cuet.ac.bd", altRegex)).toBe(true);
    expect(isCuetEmail("u2204001@student.cuet.ac.bd", altRegex)).toBe(false);
  });
});
