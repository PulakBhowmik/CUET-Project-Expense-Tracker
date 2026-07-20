import { formatBdt } from "@/lib/money";
import { balanceMessage, balanceKind, findBalance } from "@/lib/calc";
import type { ProjectBalances } from "@/lib/services/balances";

export function BalancesPanel({
  balances,
  currentUserId,
}: {
  balances: ProjectBalances;
  currentUserId: string;
}) {
  const { cycle, lifetimeTotalPaisa } = balances;
  const mine = findBalance(cycle, currentUserId);
  const kind = mine ? balanceKind(mine.netBalancePaisa) : "settled";

  const kindStyles: Record<string, string> = {
    owe: "border-destructive/30 bg-destructive/10 text-destructive",
    receive:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    settled: "border-border bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Current-cycle total" value={formatBdt(cycle.cycleTotalPaisa)} />
        <Stat
          label="Your equal share"
          value={mine ? formatBdt(mine.sharePaisa) : formatBdt(0n)}
        />
        <Stat
          label="You've paid (this cycle)"
          value={mine ? formatBdt(mine.paidPaisa) : formatBdt(0n)}
        />
      </div>

      <div
        className={`rounded-lg border p-4 text-center text-lg font-semibold ${kindStyles[kind]}`}
      >
        {mine ? balanceMessage(mine.netBalancePaisa) : "You are settled"}
      </div>

      <p className="text-muted-foreground text-center text-xs">
        Lifetime total (all cycles): {formatBdt(lifetimeTotalPaisa)}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
