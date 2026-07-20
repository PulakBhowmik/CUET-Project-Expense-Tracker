import { describe, it, expect } from "vitest";
import {
  takaToPaisa,
  paisaToDecimalString,
  formatBdt,
  sumPaisa,
  absPaisa,
  InvalidMoneyError,
} from "@/lib/money";

describe("takaToPaisa", () => {
  it("parses whole and fractional taka strings", () => {
    expect(takaToPaisa("100")).toBe(10000n);
    expect(takaToPaisa("12.50")).toBe(1250n);
    expect(takaToPaisa("12.5")).toBe(1250n);
    expect(takaToPaisa("0.01")).toBe(1n);
    expect(takaToPaisa("0")).toBe(0n);
  });

  it("accepts numeric input with up to two decimals", () => {
    expect(takaToPaisa(12.5)).toBe(1250n);
    expect(takaToPaisa(100)).toBe(10000n);
  });

  it("trims surrounding whitespace", () => {
    expect(takaToPaisa("  25.00 ")).toBe(2500n);
  });

  it.each(["12.505", "-5", "abc", "1.2.3", "", "1e3", "12,50", ".5"])(
    "rejects invalid amount %j",
    (bad) => {
      expect(() => takaToPaisa(bad)).toThrow(InvalidMoneyError);
    },
  );

  it("rejects imprecise float sums (fails loudly, never silently rounds)", () => {
    // 0.1 + 0.2 === 0.30000000000000004
    expect(() => takaToPaisa(0.1 + 0.2)).toThrow(InvalidMoneyError);
  });
});

describe("paisaToDecimalString", () => {
  it("always shows two decimals", () => {
    expect(paisaToDecimalString(1250n)).toBe("12.50");
    expect(paisaToDecimalString(1n)).toBe("0.01");
    expect(paisaToDecimalString(10000n)).toBe("100.00");
    expect(paisaToDecimalString(0n)).toBe("0.00");
  });

  it("handles negative balances (money owed)", () => {
    expect(paisaToDecimalString(-7500n)).toBe("-75.00");
  });
});

describe("formatBdt", () => {
  it("adds the BDT sign and thousands separators", () => {
    expect(formatBdt(1234567n)).toBe("৳12,345.67");
    expect(formatBdt(2500n)).toBe("৳25.00");
    expect(formatBdt(-2500n)).toBe("-৳25.00");
    expect(formatBdt(100000000n)).toBe("৳1,000,000.00");
  });
});

describe("helpers", () => {
  it("sums paisa amounts", () => {
    expect(sumPaisa([2500n, 7500n, 1n])).toBe(10001n);
    expect(sumPaisa([])).toBe(0n);
  });

  it("takes absolute value", () => {
    expect(absPaisa(-1n)).toBe(1n);
    expect(absPaisa(5n)).toBe(5n);
  });
});

describe("round trip", () => {
  it.each(["0.00", "0.01", "12.50", "999.99", "1000000.00"])(
    "decimal string %s survives parse -> format",
    (s) => {
      expect(paisaToDecimalString(takaToPaisa(s))).toBe(s);
    },
  );
});
