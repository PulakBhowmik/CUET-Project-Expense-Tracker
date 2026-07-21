import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            CUET Expense Splitter is only open to CUET student accounts.
          </p>
        </div>

        <LoginForm />

        <div className="space-y-2 text-center text-sm">
          <p className="text-muted-foreground">
            New here?{" "}
            <Link
              href="/signup"
              className="text-foreground underline underline-offset-4"
            >
              Create an account
            </Link>
          </p>
          <p className="text-muted-foreground">
            <Link
              href="/forgot-password"
              className="underline underline-offset-4"
            >
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
