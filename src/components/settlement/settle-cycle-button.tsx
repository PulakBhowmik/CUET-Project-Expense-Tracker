"use client";

import { useState, useTransition } from "react";
import { settleAction } from "@/server/actions/settlement-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface SettlementPreviewRow {
  id: string;
  name: string;
  paid: string;
  share: string;
  net: string;
}

export interface SettlementPreview {
  cycleTotal: string;
  memberCount: number;
  equalShare: string;
  rows: SettlementPreviewRow[];
}

export function SettleCycleButton({
  projectId,
  hasUnsettled,
  preview,
}: {
  projectId: string;
  hasUnsettled: boolean;
  preview: SettlementPreview;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    // A fresh key per confirmed attempt; a double-click reuses the same
    // in-flight transition, and a retried request is idempotent server-side.
    const idempotencyKey = crypto.randomUUID();
    startTransition(async () => {
      const res = await settleAction(projectId, idempotencyKey);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!hasUnsettled}>Mark current expenses as split</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settle the current cycle?</DialogTitle>
          <DialogDescription>
            This locks all current expenses and records a snapshot. It can&apos;t
            be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <Summary label="Total" value={preview.cycleTotal} />
          <Summary label="Members" value={String(preview.memberCount)} />
          <Summary label="Equal share" value={preview.equalShare} />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.paid}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.share}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.net}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending ? "Settling…" : "Confirm settlement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
