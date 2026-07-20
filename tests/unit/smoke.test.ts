import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("test runner works", () => {
    expect(1 + 1).toBe(2);
  });

  it("supports BigInt arithmetic (used for money in paisa)", () => {
    const a = 2500n;
    const b = 7500n;
    expect(a + b).toBe(10000n);
  });
});
