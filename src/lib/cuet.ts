/**
 * CUET email policy (pure, server-side authority).
 *
 * Only addresses matching the configured pattern may receive a sign-in code,
 * create an account, be invited, or sign in. The check runs on the server in
 * every one of those paths, so the frontend cannot bypass it.
 * See docs/SECURITY.md §2.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isCuetEmail(email: string, emailRegex: string): boolean {
  return new RegExp(emailRegex).test(normalizeEmail(email));
}
