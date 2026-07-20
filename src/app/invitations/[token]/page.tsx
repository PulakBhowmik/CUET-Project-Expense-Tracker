import type { ReactNode } from "react";
import { auth, signIn } from "@/lib/auth";
import { getInvitationPreview } from "@/lib/services/invitation";
import { normalizeEmail } from "@/lib/cuet";
import { Button } from "@/components/ui/button";
import { AcceptInvitationButton } from "@/components/invitations/accept-invitation-button";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [session, preview] = await Promise.all([
    auth(),
    getInvitationPreview(token),
  ]);

  if (!preview) {
    return (
      <StatusCard
        title="Invitation not found"
        message="This invitation link is invalid or has expired. Ask the project leader to send a new one."
      />
    );
  }

  if (!session?.user) {
    return (
      <StatusCard
        title="You're invited!"
        message={`Sign in with the Google account for ${preview.email} to join "${preview.projectName}".`}
      >
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/invitations/${token}` });
          }}
        >
          <Button type="submit" className="w-full">
            Sign in with Google
          </Button>
        </form>
      </StatusCard>
    );
  }

  if (normalizeEmail(session.user.email ?? "") !== preview.email) {
    return (
      <StatusCard
        title="Wrong account"
        message={`This invitation was sent to ${preview.email}, but you're signed in as ${session.user.email}. Sign in with the invited account to accept it.`}
      />
    );
  }

  return (
    <StatusCard
      title="You're invited!"
      message={`Join "${preview.projectName}" as a member.`}
    >
      <AcceptInvitationButton token={token} />
    </StatusCard>
  );
}

function StatusCard({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{message}</p>
        {children}
      </div>
    </main>
  );
}
