import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getProjectForUser } from "@/lib/services/project";
import { listExpenses } from "@/lib/services/expense";
import { getProjectBalances } from "@/lib/services/balances";
import { NotFoundError } from "@/lib/errors";
import { InviteMemberForm } from "@/components/projects/invite-member-form";
import { PendingInvitationsList } from "@/components/projects/pending-invitations-list";
import { AddExpenseForm } from "@/components/expenses/add-expense-form";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { BalancesPanel } from "@/components/expenses/balances-panel";
import { listSettlements } from "@/lib/services/settlement";
import { SettleCycleButton } from "@/components/settlement/settle-cycle-button";
import { SettlementHistory } from "@/components/settlement/settlement-history";
import { formatBdt } from "@/lib/money";
import { LiveRefresh } from "@/components/live-refresh";

// Membership-gated: non-members and nonexistent project ids both resolve to
// the same 404 (docs/AUTHORIZATION.md §4). Realtime sync + settlement history
// arrive in later phases.
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  const { projectId } = await params;

  // Authorization gate first. Its result is request-cached, so the four reads
  // below reuse it instead of re-querying — and they run in parallel rather
  // than in sequence, which matters because every round trip to the database
  // costs real latency.
  let detail, balances, expenses, settlements;
  try {
    [detail, balances, expenses, settlements] = await Promise.all([
      getProjectForUser(userId, projectId),
      getProjectBalances(userId, projectId),
      listExpenses(userId, projectId),
      listSettlements(userId, projectId),
    ]);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const { project, members, isLeader, isCreator } = detail;
  const leader = members.find((m) => m.id === project.leaderMemberId);

  // Serializable breakdown for the settlement confirmation modal (no bigints
  // cross the server/client boundary).
  const hasUnsettled = balances.cycle.cycleTotalPaisa > 0n;
  const settlementPreview = {
    cycleTotal: formatBdt(balances.cycle.cycleTotalPaisa),
    memberCount: balances.cycle.activeMemberCount,
    equalShare: formatBdt(balances.cycle.baseSharePaisa),
    rows: balances.cycle.balances.map((b) => ({
      id: b.userId,
      name:
        balances.memberNames[b.userId]?.name ??
        balances.memberNames[b.userId]?.email ??
        "Member",
      paid: formatBdt(b.paidPaisa),
      share: formatBdt(b.sharePaisa),
      net:
        b.netBalancePaisa > 0n
          ? `+${formatBdt(b.netBalancePaisa)}`
          : formatBdt(b.netBalancePaisa),
    })),
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground mb-1 inline-block text-sm"
          >
            ← All projects
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            Leader: {leader?.name ?? leader?.email ?? "Unknown"}
            {isLeader && " (you)"}
            {isCreator && !isLeader && " · you created this project"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveRefresh />
          {(isLeader || isCreator) && (
            <Link
              href={`/projects/${project.id}/settings`}
              className="text-muted-foreground hover:text-foreground text-sm underline"
            >
              Settings
            </Link>
          )}
        </div>
      </div>

      <BalancesPanel balances={balances} currentUserId={userId} />

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-medium">Add an expense</h2>
        <AddExpenseForm projectId={project.id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Expenses</h2>
        <ExpenseTable projectId={project.id} expenses={expenses} />
      </section>

      {isLeader && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Settle up</h2>
          <p className="text-muted-foreground text-sm">
            {hasUnsettled
              ? "Lock the current expenses and record who owes what. Settled expenses can no longer be edited."
              : "There are no unsettled expenses to split right now."}
          </p>
          <SettleCycleButton
            projectId={project.id}
            hasUnsettled={hasUnsettled}
            preview={settlementPreview}
          />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Settlement history</h2>
        <SettlementHistory settlements={settlements} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Members ({members.length})</h2>
        <ul className="divide-y rounded-lg border">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between p-3 text-sm"
            >
              <span>
                {m.name ?? m.email}
                {m.userId === userId && " (you)"}
              </span>
              {m.id === project.leaderMemberId && (
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                  Leader
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {(isLeader || isCreator) && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Invite a member</h2>
          <InviteMemberForm projectId={project.id} />
          <PendingInvitationsList actorUserId={userId} projectId={project.id} />
        </section>
      )}
    </main>
  );
}
