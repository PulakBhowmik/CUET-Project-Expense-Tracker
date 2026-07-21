/**
 * CUET sign-in policy (pure, server-side authority).
 *
 * A Google account is accepted only if ALL hold:
 *   - it has a stable `sub` (used as the permanent identity key)
 *   - it has an email that is verified (`email_verified === true`)
 *   - the (normalized) email matches the configured CUET regex
 *   - if a hosted domain is configured AND the profile carries an `hd` claim,
 *     the `hd` matches the configured domain
 *
 * This runs on the server in the Auth.js sign-in callback; the frontend cannot
 * bypass it. See docs/SECURITY.md §2.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CuetAuthConfig {
  /** Regex source string, e.g. "^u2204[0-9]{3}@student\\.cuet\\.ac\\.bd$". */
  emailRegex: string;
  /** Optional Google Workspace hosted domain to enforce when the hd claim exists. */
  hostedDomain?: string;
}

export interface GoogleProfileLike {
  sub?: string | null;
  email?: string | null;
  email_verified?: boolean | null;
  /** Hosted-domain claim (present for Google Workspace accounts). */
  hd?: string | null;
}

export type SignInRejectionReason =
  | "missing_sub"
  | "missing_email"
  | "email_unverified"
  | "domain_not_allowed"
  | "hosted_domain_mismatch";

export type SignInDecision =
  | { ok: true; googleSub: string; email: string }
  | { ok: false; reason: SignInRejectionReason };

export function isCuetEmail(email: string, emailRegex: string): boolean {
  return new RegExp(emailRegex).test(normalizeEmail(email));
}

export function evaluateCuetSignIn(
  profile: GoogleProfileLike,
  config: CuetAuthConfig,
): SignInDecision {
  if (!profile.sub) {
    return { ok: false, reason: "missing_sub" };
  }
  if (!profile.email) {
    return { ok: false, reason: "missing_email" };
  }
  if (profile.email_verified !== true) {
    return { ok: false, reason: "email_unverified" };
  }

  const email = normalizeEmail(profile.email);

  if (!isCuetEmail(email, config.emailRegex)) {
    return { ok: false, reason: "domain_not_allowed" };
  }

  // Enforce hosted domain only when configured AND present on the profile.
  if (config.hostedDomain && profile.hd && profile.hd !== config.hostedDomain) {
    return { ok: false, reason: "hosted_domain_mismatch" };
  }

  return { ok: true, googleSub: profile.sub, email };
}
