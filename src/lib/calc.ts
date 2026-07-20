/**
 * Equal-split calculation service (pure, deterministic, integer paisa).
 *
 * For a cycle, every active member owes an equal share of the cycle total.
 * When the total does not divide evenly to the paisa, the leftover paisa are
 * distributed one-per-member to the members with the lowest `userId` first, so
 * the result is fully deterministic and the invariants hold:
 *
 *   sum(sharePaisa)      === cycleTotalPaisa
 *   sum(netBalancePaisa) === 0
 *
 * `netBalancePaisa = paidPaisa - sharePaisa`:
 *   < 0  -> the member owes money
 *   > 0  -> the member should be reimbursed
 *   = 0  -> settled
 */
import { absPaisa, formatBdt, sumPaisa } from "@/lib/money";

export interface MemberPaid {
  userId: string;
  /** Total this member paid in the cycle (0 if they paid nothing). */
  paidPaisa: bigint;
}

export interface MemberBalance {
  userId: string;
  paidPaisa: bigint;
  sharePaisa: bigint;
  netBalancePaisa: bigint;
}

export interface CycleBalances {
  cycleTotalPaisa: bigint;
  activeMemberCount: number;
  /** Nominal equal share before remainder distribution: floor(total / n). */
  baseSharePaisa: bigint;
  /** One entry per active member, ordered by `userId` ascending. */
  balances: MemberBalance[];
}

/**
 * Compute per-member shares and net balances for a cycle.
 *
 * @param members All active members and how much each has paid this cycle.
 *   The cycle total is the sum of their paid amounts (every unsettled expense
 *   is paid by an active member), so the invariants above always hold.
 */
export function computeCycleBalances(
  members: readonly MemberPaid[],
): CycleBalances {
  const n = members.length;
  const cycleTotalPaisa = sumPaisa(members.map((m) => m.paidPaisa));

  if (n === 0) {
    if (cycleTotalPaisa !== 0n) {
      throw new Error("Cannot split a non-zero total among zero members");
    }
    return {
      cycleTotalPaisa: 0n,
      activeMemberCount: 0,
      baseSharePaisa: 0n,
      balances: [],
    };
  }

  const nBig = BigInt(n);
  const baseSharePaisa = cycleTotalPaisa / nBig; // floor; total >= 0
  const remainder = cycleTotalPaisa - baseSharePaisa * nBig; // 0 .. n-1

  // Deterministic order for remainder distribution.
  const ordered = [...members].sort((a, b) =>
    a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
  );

  const balances: MemberBalance[] = ordered.map((m, i) => {
    const extra = BigInt(i) < remainder ? 1n : 0n;
    const sharePaisa = baseSharePaisa + extra;
    return {
      userId: m.userId,
      paidPaisa: m.paidPaisa,
      sharePaisa,
      netBalancePaisa: m.paidPaisa - sharePaisa,
    };
  });

  return { cycleTotalPaisa, activeMemberCount: n, baseSharePaisa, balances };
}

export function findBalance(
  cycle: CycleBalances,
  userId: string,
): MemberBalance | undefined {
  return cycle.balances.find((b) => b.userId === userId);
}

export type BalanceKind = "owe" | "receive" | "settled";

export function balanceKind(netBalancePaisa: bigint): BalanceKind {
  if (netBalancePaisa < 0n) return "owe";
  if (netBalancePaisa > 0n) return "receive";
  return "settled";
}

/** Human-readable balance message per the product spec. */
export function balanceMessage(netBalancePaisa: bigint): string {
  switch (balanceKind(netBalancePaisa)) {
    case "owe":
      return `You owe ${formatBdt(absPaisa(netBalancePaisa))}`;
    case "receive":
      return `You should receive ${formatBdt(netBalancePaisa)}`;
    case "settled":
      return "You are settled";
  }
}
