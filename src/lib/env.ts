import { z } from "zod";

/**
 * Environment-variable validation (fail fast).
 *
 * `parseEnv` is a pure function so it can be unit-tested with fixtures.
 * Server code should call `getEnv()`, which parses `process.env` once and
 * caches the result. This module reads secrets and must only be imported from
 * server code (Server Components, Server Actions, Route Handlers).
 */

const booleanFromString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),

  // Auth.js core
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  AUTH_URL: z.string().url().optional(),

  // Google OpenID Connect
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  // Optional Google Workspace hosted-domain claim to enforce when present.
  GOOGLE_HOSTED_DOMAIN: z.string().optional(),

  // CUET restrictions (configurable)
  CUET_EMAIL_REGEX: z
    .string()
    .min(1)
    .default("^u2204[0-9]{3}@student\\.cuet\\.ac\\.bd$")
    .refine((v) => {
      try {
        new RegExp(v);
        return true;
      } catch {
        return false;
      }
    }, "CUET_EMAIL_REGEX must be a valid regular expression"),

  // Invitations
  INVITATION_TOKEN_SECRET: z
    .string()
    .min(1, "INVITATION_TOKEN_SECRET is required"),
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(168),

  // Feature flags
  FEATURE_APP_OTP: booleanFromString.default(false),

  // Realtime (Supabase) — required only once realtime is wired (Phase 7).
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Rate limiting knobs
  RATE_LIMIT_INVITES_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_ACCEPT_PER_MIN: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(
  raw: NodeJS.ProcessEnv | Record<string, unknown>,
): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}
