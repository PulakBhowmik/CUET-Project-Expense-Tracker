"use server";

import { z } from "zod";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import {
  requestCode,
  verifyCode,
  completeSignup,
} from "@/lib/services/account";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/password";
import { toSafeError } from "@/lib/errors";

export interface AuthFormState {
  error?: string;
  /** Advances the multi-step sign-up UI. */
  step?: "email" | "code" | "password";
  email?: string;
  /**
   * The verified code, carried into the password step so it can be consumed
   * there. Safe to round-trip: the user already has it from their inbox, and
   * the server re-verifies it before setting any password.
   */
  code?: string;
  notice?: string;
}

const emailSchema = z.object({ email: z.string().trim().min(1) });
const codeSchema = z.object({
  email: z.string().trim().min(1),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
});
const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  )
  .max(MAX_PASSWORD_LENGTH, "That password is too long.");

/** Step 1 — email the code. */
export async function requestCodeAction(
  purpose: "SIGNUP" | "PASSWORD_RESET",
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { step: "email", error: "Enter your CUET email address." };
  }

  try {
    const { email } = await requestCode(parsed.data.email, purpose);
    return {
      step: "code",
      email,
      notice: `We sent a 6-digit code to ${email}. It expires in 10 minutes.`,
    };
  } catch (err) {
    return { step: "email", error: toSafeError(err).message };
  }
}

/** Step 2 — check the code, then show the password field. */
export async function verifyCodeAction(
  purpose: "SIGNUP" | "PASSWORD_RESET",
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = codeSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return {
      step: "code",
      email: String(formData.get("email") ?? ""),
      error: parsed.error.issues[0]?.message ?? "Invalid code.",
    };
  }

  try {
    const ok = await verifyCode(parsed.data.email, parsed.data.code, purpose);
    if (!ok) {
      return {
        step: "code",
        email: parsed.data.email,
        error: "That code is incorrect or has expired.",
      };
    }
    return { step: "password", email: parsed.data.email, code: parsed.data.code };
  } catch (err) {
    return {
      step: "code",
      email: parsed.data.email,
      error: toSafeError(err).message,
    };
  }
}

/** Step 3 — consume the code, set the password, and sign in. */
export async function setPasswordAction(
  purpose: "SIGNUP" | "PASSWORD_RESET",
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return {
      step: "password",
      email,
      error: parsed.error.issues[0]?.message ?? "Invalid password.",
    };
  }
  if (password !== confirm) {
    return { step: "password", email, error: "The passwords don't match." };
  }

  try {
    await completeSignup(email, code, password, purpose);
  } catch (err) {
    return { step: "password", email, error: toSafeError(err).message };
  }

  // Sign in immediately; this throws a redirect on success.
  await signIn("credentials", {
    email,
    password,
    redirectTo: "/dashboard",
  });
  return { step: "password", email };
}

/** Returning users: email + password. */
export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (err) {
    // A thrown redirect is how a SUCCESSFUL sign-in exits — rethrow it.
    if (err instanceof AuthError) {
      return { error: "Incorrect email or password." };
    }
    throw err;
  }
  return {};
}
