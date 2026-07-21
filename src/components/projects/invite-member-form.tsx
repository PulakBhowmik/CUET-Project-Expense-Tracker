"use client";

import { useActionState, useState } from "react";
import {
  createInvitationAction,
  type CreateInvitationActionState,
} from "@/server/actions/invitation-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CreateInvitationActionState = {};

export function InviteMemberForm({ projectId }: { projectId: string }) {
  const action = createInvitationAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [copied, setCopied] = useState(false);
  // Tracks which token the user has dismissed, rather than a plain boolean,
  // so a NEW successful invite (a different token) shows the success view
  // again automatically — derived at render time, no effect needed.
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);

  const showSuccess =
    Boolean(state.inviteToken) && state.inviteToken !== dismissedToken;
  // Only reached after a client-side action result, so `window` is safe here
  // (never evaluated during the initial server render).
  const inviteUrl = showSuccess
    ? `${window.location.origin}/invitations/${state.inviteToken}`
    : null;

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (showSuccess && inviteUrl) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">
          Invitation created for {state.invitedEmail}
        </p>
        <p className="text-muted-foreground text-sm">
          Copy this link and send it to them directly (e.g. WhatsApp or
          Messenger). For your security, it won&apos;t be shown again.
        </p>
        <div className="flex gap-2">
          <Input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDismissedToken(state.inviteToken ?? null)}
        >
          Invite someone else
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="flex-1 space-y-2">
        <Label htmlFor="invite-email">Invite by CUET email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          placeholder="u2204001@student.cuet.ac.bd"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "invite-error" : undefined}
        />
        {state.error && (
          <p
            id="invite-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
    </form>
  );
}
