import { describe, it, expect } from "vitest";
import {
  computeCycleBalances,
  balanceKind,
  balanceMessage,
  findBalance,
  type MemberPaid,
} from "@/lib/calc";
import { sumPaisa } from "@/lib/money";

describe("computeCycleBalances — the spec example", () => {
  // Four members, current total ৳100 (10000 paisa), one member paid all.
  const members: MemberPaid[] = [
    { userId: "u1", paidPaisa: 10000n },
    { userId: "u2", paidPaisa: 0n },
    { userId: "u3", paidPaisa: 0n },
    { userId: "u4", paidPaisa: 0n },
  ];

  it("splits ৳100 among 4 as ৳25 each", () => {
    const result = computeCycleBalances(members);
    expect(result.cycleTotalPaisa).toBe(10000n);
    expect(result.activeMemberCount).toBe(4);
    expect(result.baseSharePaisa).toBe(2500n);
    for (const b of result.balances) {
      expect(b.sharePaisa).toBe(2500n);
    }
  });

  it("the payer should receive ৳75, each other owes ৳25", () => {
    const result = computeCycleBalances(members);
    expect(findBalance(result, "u1")!.netBalancePaisa).toBe(7500n); // +75.00
    expect(findBalance(result, "u2")!.netBalancePaisa).toBe(-2500n); // -25.00
    expect(findBalance(result, "u3")!.netBalancePaisa).toBe(-2500n);
    expect(findBalance(result, "u4")!.netBalancePaisa).toBe(-2500n);
  });
});

describe("invariants hold for every case", () => {
  const cases: MemberPaid[][] = [
    [{ userId: "a", paidPaisa: 10000n }, { userId: "b", paidPaisa: 0n }, { userId: "c", paidPaisa: 0n }], // 10000/3
    [{ userId: "a", paidPaisa: 100n }, { userId: "b", paidPaisa: 1n }], // odd split
    [{ userId: "a", paidPaisa: 3333n }, { userId: "b", paidPaisa: 3333n }, { userId: "c", paidPaisa: 3334n }],
    [{ userId: "x", paidPaisa: 1n }, { userId: "y", paidPaisa: 0n }, { userId: "z", paidPaisa: 0n }, { userId: "w", paidPaisa: 0n }],
  ];

  it.each(cases)("sum(share)=total and sum(net)=0 (case %#)", (...members) => {
    const result = computeCycleBalances(members);
    expect(sumPaisa(result.balances.map((b) => b.sharePaisa))).toBe(
      result.cycleTotalPaisa,
    );
    expect(sumPaisa(result.balances.map((b) => b.netBalancePaisa))).toBe(0n);
  });
});

describe("deterministic remainder distribution", () => {
  it("gives leftover paisa to the lowest userIds first", () => {
    // 10000 / 3 = 3333 remainder 1 -> lowest userId gets the extra paisa.
    const result = computeCycleBalances([
      { userId: "u3", paidPaisa: 0n },
      { userId: "u1", paidPaisa: 10000n },
      { userId: "u2", paidPaisa: 0n },
    ]);
    expect(findBalance(result, "u1")!.sharePaisa).toBe(3334n); // extra paisa
    expect(findBalance(result, "u2")!.sharePaisa).toBe(3333n);
    expect(findBalance(result, "u3")!.sharePaisa).toBe(3333n);
  });

  it("is independent of input ordering", () => {
    const a = computeCycleBalances([
      { userId: "b", paidPaisa: 5000n },
      { userId: "a", paidPaisa: 2n },
      { userId: "c", paidPaisa: 0n },
    ]);
    const b = computeCycleBalances([
      { userId: "c", paidPaisa: 0n },
      { userId: "b", paidPaisa: 5000n },
      { userId: "a", paidPaisa: 2n },
    ]);
    expect(a.balances).toEqual(b.balances);
  });
});

describe("edge cases", () => {
  it("single member owes nothing (share equals what they paid back to self)", () => {
    const result = computeCycleBalances([{ userId: "solo", paidPaisa: 5000n }]);
    expect(result.balances[0].sharePaisa).toBe(5000n);
    expect(result.balances[0].netBalancePaisa).toBe(0n);
  });

  it("empty cycle: everyone is settled", () => {
    const result = computeCycleBalances([
      { userId: "a", paidPaisa: 0n },
      { userId: "b", paidPaisa: 0n },
    ]);
    expect(result.cycleTotalPaisa).toBe(0n);
    expect(result.balances.every((b) => b.netBalancePaisa === 0n)).toBe(true);
  });

  it("zero members with zero total is allowed", () => {
    const result = computeCycleBalances([]);
    expect(result.balances).toEqual([]);
  });
});

describe("balance display helpers", () => {
  it("classifies balances", () => {
    expect(balanceKind(-2500n)).toBe("owe");
    expect(balanceKind(7500n)).toBe("receive");
    expect(balanceKind(0n)).toBe("settled");
  });

  it("formats the spec messages", () => {
    expect(balanceMessage(-2500n)).toBe("You owe ৳25.00");
    expect(balanceMessage(7500n)).toBe("You should receive ৳75.00");
    expect(balanceMessage(0n)).toBe("You are settled");
  });
});
