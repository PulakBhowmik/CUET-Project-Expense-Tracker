import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { OtpSignupForm } from "@/components/auth/otp-signup-form";

export default async function SignupPage() {
  const session = await getSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="text-muted-foreground text-sm">
            We&apos;ll email a code to your CUET address to confirm it&apos;s
            you.
          </p>
        </div>

        <OtpSignupForm purpose="SIGNUP" />

        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
