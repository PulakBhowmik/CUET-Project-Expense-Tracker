"use client";

import { useActionState } from "react";
import {
  createProjectAction,
  type CreateProjectActionState,
} from "@/server/actions/project-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CreateProjectActionState = {};

export function CreateProjectForm() {
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Project name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Software Lab Project"
          required
          maxLength={80}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "name-error" : undefined}
        />
        {state.error && (
          <p id="name-error" role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create project"}
      </Button>
    </form>
  );
}
