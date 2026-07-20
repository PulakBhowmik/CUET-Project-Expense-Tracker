"use client";

import { useState, useTransition } from "react";
import {
  updateExpenseAction,
  deleteExpenseAction,
} from "@/server/actions/expense-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface ExpenseRowActionsProps {
  projectId: string;
  expenseId: string;
  title: string;
  description: string;
  amountDecimal: string;
  dateISO: string;
}

export function ExpenseRowActions(props: ExpenseRowActionsProps) {
  return (
    <div className="flex justify-end gap-2">
      <EditExpenseDialog {...props} />
      <DeleteExpenseDialog {...props} />
    </div>
  );
}

function EditExpenseDialog({
  projectId,
  expenseId,
  title,
  description,
  amountDecimal,
  dateISO,
}: ExpenseRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const todayISO = new Date().toISOString().slice(0, 10);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateExpenseAction(projectId, expenseId, {}, formData);
      // setState here is inside a transition callback, NOT an effect — allowed.
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
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>
            You can only edit your own unsettled expenses.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`edit-title-${expenseId}`}>Purpose</Label>
            <Input
              id={`edit-title-${expenseId}`}
              name="title"
              defaultValue={title}
              required
              maxLength={100}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`edit-amount-${expenseId}`}>Amount (৳)</Label>
              <Input
                id={`edit-amount-${expenseId}`}
                name="amount"
                inputMode="decimal"
                defaultValue={amountDecimal}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-date-${expenseId}`}>Date</Label>
              <Input
                id={`edit-date-${expenseId}`}
                name="expenseDate"
                type="date"
                defaultValue={dateISO}
                max={todayISO}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-desc-${expenseId}`}>Note (optional)</Label>
            <Textarea
              id={`edit-desc-${expenseId}`}
              name="description"
              defaultValue={description}
              rows={2}
              maxLength={500}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteExpenseDialog({
  projectId,
  expenseId,
  title,
}: ExpenseRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteExpenseAction(projectId, expenseId);
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
        <Button variant="ghost" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete expense?</DialogTitle>
          <DialogDescription>
            &quot;{title}&quot; will be permanently removed. This can&apos;t be
            undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
