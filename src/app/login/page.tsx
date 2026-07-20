import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { SignInRejectionReason } from "@/lib/cuet";

// Keyed by SignInRejectionReason so TypeScript flags a missing entry if a new
// rejection reason is ever added to src/lib/cuet.ts.
const CUET_REASON_MESSAGES: Record<SignInRejectionReason, string> = {
  missing_sub:
    "Google did not return an account identifier. Please try again.",
  missing_email: "Your Google account did not provide an email address.",
  email_unverified:
    "Your Google email address is not verified. Please verify it with Google, then try again.",
  domain_not_allowed: "Only CUET student email accounts can sign in here.",
  hosted_domain_mismatch:
    "This Google account is not part of the CUET Google Workspace.",
};

const GENERIC_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Access denied. This account is not allowed to sign in.",
  Configuration: "Sign-in is temporarily unavailable. Please try again later.",
  Verification: "That sign-in link is no longer valid.",
};

function resolveMessage(error?: string, reason?: string): string | null {
  if (reason && reason in CUET_REASON_MESSAGES) {
    return CUET_REASON_MESSAGES[reason as SignInRejectionReason];
  }
  if (error) {
    return GENERIC_ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.";
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const message = resolveMessage(params.error, params.reason);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            CUET Expense Splitter is only open to CUET student Google
            accounts.
          </p>
        </div>

        {message && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
          >
            {message}
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" className="w-full">
            Sign in with Google
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-xs">
          <Link href="/" className="underline underline-offset-4">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
