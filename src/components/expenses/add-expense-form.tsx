"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createExpenseAction,
  type ExpenseFormState,
} from "@/server/actions/expense-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ExpenseFormState = {};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpenseForm({ projectId }: { projectId: string }) {
  const action = createExpenseAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the fields after a successful add (a DOM side effect, not setState).
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Purpose</Label>
          <Input
            id="title"
            name="title"
            placeholder="e.g. Printing, components"
            required
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (৳)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="120.50"
            required
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="expenseDate">Date</Label>
          <Input
            id="expenseDate"
            name="expenseDate"
            type="date"
            defaultValue={today()}
            max={today()}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Note (optional)</Label>
          <Textarea
            id="description"
            name="description"
            rows={1}
            maxLength={500}
            placeholder="Any details"
          />
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add expense"}
      </Button>
    </form>
  );
}
