import { formatBdt, paisaToDecimalString } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpenseRowActions } from "./expense-row-actions";
import type { ExpenseRow } from "@/lib/services/expense";

export function ExpenseTable({
  projectId,
  expenses,
}: {
  projectId: string;
  expenses: ExpenseRow[];
}) {
  if (expenses.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No expenses yet. Add the first one above.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purpose</TableHead>
            <TableHead>Payer</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-medium">
                {e.title}
                {e.description && (
                  <span className="text-muted-foreground block text-xs">
                    {e.description}
                  </span>
                )}
              </TableCell>
              <TableCell>{e.payerName ?? e.payerEmail}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBdt(e.amountPaisa)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {e.expenseDate.toLocaleDateString()}
              </TableCell>
              <TableCell>
                {e.settled ? (
                  <Badge variant="secondary">Settled</Badge>
                ) : (
                  <Badge variant="outline">Current</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {e.canModify ? (
                  <ExpenseRowActions
                    projectId={projectId}
                    expenseId={e.id}
                    title={e.title}
                    description={e.description ?? ""}
                    amountDecimal={paisaToDecimalString(e.amountPaisa)}
                    dateISO={e.expenseDate.toISOString().slice(0, 10)}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
