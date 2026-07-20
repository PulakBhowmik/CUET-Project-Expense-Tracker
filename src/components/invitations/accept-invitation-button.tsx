"use client";

import { useState, useTransition } from "react";
import { acceptInvitationAction } from "@/server/actions/invitation-actions";
import { Button } from "@/components/ui/button";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptInvitationAction(token);
      // On success the action redirects and never returns here.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleAccept} disabled={pending} className="w-full">
        {pending ? "Joining…" : "Accept & join project"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
