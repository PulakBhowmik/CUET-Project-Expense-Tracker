import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { OtpSignupForm } from "@/components/auth/otp-signup-form";

export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Reset your password
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter your CUET email and we&apos;ll send a code to reset your
            password.
          </p>
        </div>

        <OtpSignupForm purpose="PASSWORD_RESET" />

        <p className="text-muted-foreground text-center text-sm">
          <Link href="/login" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
