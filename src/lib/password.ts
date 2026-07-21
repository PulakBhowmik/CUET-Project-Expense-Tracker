/**
 * Password hashing with scrypt (built into Node — no native dependency, so it
 * works everywhere including Vercel's serverless runtime).
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>`
 * The parameters are stored alongside the hash so they can be raised later
 * without invalidating existing passwords.
 */
import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

// Deliberately above Node's defaults; ~100ms per hash, which is a meaningful
// brute-force cost while staying comfortable for a login request.
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/**
 * Constant-time password check. Returns false (never throws) for malformed or
 * missing hashes, so a corrupt row can't crash sign-in.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
    if (salt.length === 0 || expected.length === 0) return false;
  } catch {
    return false;
  }

  try {
    const derived = await scrypt(
      password.normalize("NFKC"),
      salt,
      expected.length,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
    );
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
