import { listPendingInvitations } from "@/lib/services/invitation";

export async function PendingInvitationsList({
  actorUserId,
  projectId,
}: {
  actorUserId: string;
  projectId: string;
}) {
  const invitations = await listPendingInvitations(actorUserId, projectId);

  if (invitations.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Pending invitations</h3>
      <ul className="divide-y rounded-lg border text-sm">
        {invitations.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between p-3">
            <span>{inv.email}</span>
            <span className="text-muted-foreground text-xs">
              Expires {inv.expiresAt.toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
