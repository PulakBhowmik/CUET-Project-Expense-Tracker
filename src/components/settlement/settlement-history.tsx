import { formatBdt } from "@/lib/money";
import type { SettlementSummary } from "@/lib/services/settlement";

function signedBdt(paisa: bigint): string {
  if (paisa > 0n) return `+${formatBdt(paisa)}`;
  return formatBdt(paisa); // formatBdt already prefixes "-" for negatives
}

export function SettlementHistory({
  settlements,
}: {
  settlements: SettlementSummary[];
}) {
  if (settlements.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No settlements yet. When the leader settles the current cycle, a
        permanent record will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {settlements.map((s) => (
        <div key={s.id} className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {formatBdt(s.cycleTotalPaisa)} across {s.activeMemberCount} member
              {s.activeMemberCount === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground text-xs">
              {(s.completedAt ?? s.createdAt).toLocaleString()}
            </span>
          </div>
          <ul className="divide-y text-sm">
            {s.balances.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between py-1.5"
              >
                <span>{b.name ?? b.email}</span>
                <span className="tabular-nums">
                  paid {formatBdt(b.paidPaisa)} · share{" "}
                  {formatBdt(b.sharePaisa)} ·{" "}
                  <span
                    className={
                      b.netBalancePaisa > 0n
                        ? "text-emerald-600 dark:text-emerald-400"
                        : b.netBalancePaisa < 0n
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {signedBdt(b.netBalancePaisa)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
