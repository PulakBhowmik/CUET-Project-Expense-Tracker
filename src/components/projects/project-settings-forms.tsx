"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  renameProjectAction,
  transferLeadershipAction,
  deleteProjectAction,
  type SettingsFormState,
} from "@/server/actions/project-settings-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: SettingsFormState = {};

export function RenameProjectForm({
  projectId,
  currentName,
}: {
  projectId: string;
  currentName: string;
}) {
  const [state, formAction, pending] = useActionState(
    renameProjectAction.bind(null, projectId),
    initial,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="name">Project name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={currentName}
          required
          minLength={2}
          maxLength={80}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Project renamed.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

export interface TransferOption {
  userId: string;
  label: string;
}

export function TransferLeadershipForm({
  projectId,
  options,
}: {
  projectId: string;
  options: TransferOption[];
}) {
  const [state, formAction, pending] = useActionState(
    transferLeadershipAction.bind(null, projectId),
    initial,
  );

  if (options.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        There are no other members to transfer leadership to yet. Invite someone
        first.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="targetUserId">New leader</Label>
        <select
          id="targetUserId"
          name="targetUserId"
          required
          className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {options.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Leadership transferred.
        </p>
      )}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Transferring…" : "Transfer leadership"}
      </Button>
    </form>
  );
}

export function DeleteProjectForm({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [state, formAction, pending] = useActionState(
    deleteProjectAction.bind(null, projectId),
    initial,
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm">
        This permanently deletes the project and all of its expenses and
        settlement history. To confirm, type{" "}
        <strong className="font-mono">{projectName}</strong> below.
      </p>
      <div className="space-y-2">
        <Label htmlFor="confirmationName">Project name</Label>
        <Input
          id="confirmationName"
          name="confirmationName"
          placeholder={projectName}
          autoComplete="off"
          required
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Deleting…" : "Delete this project"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/projects/${projectId}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
