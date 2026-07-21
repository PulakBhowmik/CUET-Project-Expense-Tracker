"use client";

import { useActionState } from "react";
import {
  requestCodeAction,
  verifyCodeAction,
  setPasswordAction,
  type AuthFormState,
} from "@/server/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AuthFormState = { step: "email" };

/**
 * Three-step flow: email → emailed code → set password.
 *
 * Each step is its own server action, so the code is re-checked on the server
 * at every stage. Advancing the UI proves nothing on its own — the password
 * step consumes and re-verifies the code before anything is written.
 */
export function OtpSignupForm({
  purpose,
}: {
  purpose: "SIGNUP" | "PASSWORD_RESET";
}) {
  const [emailState, sendCode, sendingCode] = useActionState(
    requestCodeAction.bind(null, purpose),
    initial,
  );
  const [codeState, checkCode, checkingCode] = useActionState(
    verifyCodeAction.bind(null, purpose),
    initial,
  );
  const [pwState, setPassword, settingPassword] = useActionState(
    setPasswordAction.bind(null, purpose),
    initial,
  );

  // Whichever action has progressed furthest determines what we show.
  const step: "email" | "code" | "password" =
    pwState.step === "password" || codeState.step === "password"
      ? "password"
      : codeState.step === "code" || emailState.step === "code"
        ? "code"
        : "email";

  const email = pwState.email ?? codeState.email ?? emailState.email ?? "";
  const code = codeState.code ?? "";

  if (step === "email") {
    return (
      <form action={sendCode} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">CUET email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="u2204000@student.cuet.ac.bd"
            defaultValue={email}
            required
          />
        </div>
        {emailState.error && (
          <p role="alert" className="text-destructive text-sm">
            {emailState.error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={sendingCode}>
          {sendingCode ? "Sending code…" : "Send me a code"}
        </Button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form action={checkCode} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        {emailState.notice && !codeState.error && (
          <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
            {emailState.notice}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            className="text-center text-lg tracking-[0.4em]"
            required
          />
        </div>
        {codeState.error && (
          <p role="alert" className="text-destructive text-sm">
            {codeState.error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={checkingCode}>
          {checkingCode ? "Checking…" : "Verify code"}
        </Button>
        {/* Same form, different action — avoids invalid nested forms. */}
        <Button
          type="submit"
          formAction={sendCode}
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={sendingCode}
        >
          {sendingCode ? "Sending…" : "Send a new code"}
        </Button>
      </form>
    );
  }

  return (
    <form action={setPassword} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="code" value={code} />
      <p className="text-muted-foreground text-sm">
        Code confirmed for <strong>{email}</strong>. Now choose a password.
      </p>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-muted-foreground text-xs">At least 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {pwState.error && (
        <p role="alert" className="text-destructive text-sm">
          {pwState.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={settingPassword}>
        {settingPassword ? "Saving…" : "Set password and continue"}
      </Button>
    </form>
  );
}
