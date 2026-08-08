import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// Email + password credentials, kept in one pure-ish module so the policy and
// the hash format are unit-testable without Fastify or a database.
//
// Hashing is scrypt from node:crypto — deliberately no bcrypt/argon2
// dependency: those need a native build step, and this deploys by rsync +
// `npm install` onto a t3.micro. scrypt is memory-hard and in the standard
// library, which is the better trade here.

// Cost parameters. N=2^15 with r=8 needs ~32 MB per hash (128 * N * r), so
// maxmem is raised above node's 32 MB default. Both are recorded in the stored
// string, so raising them later doesn't invalidate existing hashes.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 96 * 1024 * 1024;
const SALT_BYTES = 16;

export const PASSWORD_MIN = 8;
// Upper bound purely as a DoS guard: scrypt cost is independent of input length,
// but there's no reason to hash a megabyte of request body.
export const PASSWORD_MAX = 200;

// Egregious passwords, blocked by value rather than by composition rules —
// length + a blocklist beats "must contain a symbol" (NIST SP 800-63B).
const BLOCKED = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyuiop', 'qwerty123', 'iloveyou', 'letmein1', 'trading123', 'propvexis',
]);

/** Lowercase + trim. The DB stores emails lowercased and unique. */
export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Deliberately loose email check: the real validation is that a person can
 * receive mail there, which we can't test at signup. This only rejects input
 * that can't be an address at all.
 */
export function isEmailShaped(email) {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) && email.length <= 254;
}

/**
 * @returns {string|null} a user-facing reason the password is unacceptable, or
 * null when it passes. Keep the strings short — they render under the field.
 */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length === 0) return 'Enter a password.';
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (password.trim().length === 0) return 'Enter a password.';
  if (BLOCKED.has(password.toLowerCase())) return 'That password is too common — pick another.';
  return null;
}

/** Hash a password into the self-describing `scrypt$N$r$p$salt$hash` format. */
export async function hashPassword(password) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(`refusing to hash a weak password: ${problem}`);
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Constant-time verify against a stored hash. Returns false (never throws) for
 * malformed or unknown-format stored values, so a bad row can't 500 a login.
 */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  if (password.length > PASSWORD_MAX) return false;      // don't hash unbounded input
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) return false;
  let expected;
  try {
    expected = Buffer.from(hashB64, 'base64');
    const salt = Buffer.from(saltB64, 'base64');
    if (!expected.length || !salt.length) return false;
    const actual = await scryptAsync(password, salt, expected.length, { ...cost, maxmem: MAXMEM });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// A real hash of a random secret, used to burn the same scrypt work on an
// unknown email as on a known one — otherwise response timing tells an attacker
// which addresses have accounts. Built once, lazily.
let decoyHash = null;
export async function equalizeTiming() {
  if (!decoyHash) decoyHash = await hashPassword(randomBytes(24).toString('base64url'));
  await verifyPassword('not-the-password', decoyHash);
}
