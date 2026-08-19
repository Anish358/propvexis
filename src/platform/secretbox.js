import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

// Authenticated encryption for secrets we must be able to READ BACK — today the
// MT5 investor password the sync worker logs in with.
//
// This is deliberately NOT the hashing in platform/auth/credentials.js. A user
// password is verified, so it is hashed one-way with scrypt and never recovered.
// An MT5 investor password has to be handed to a terminal, so it must be
// reversible. Those are opposite requirements and mixing them up is how
// reversible "hashes" happen.
//
// AES-256-GCM, from node:crypto for the same reason scrypt was chosen there: no
// native build step on a t3.micro that deploys by rsync + npm install.
//
// Two properties worth naming:
//
// 1. AUTHENTICATED. GCM's tag means a tampered ciphertext fails to open rather
//    than decrypting to garbage we would then type into a broker login.
// 2. BOUND TO ITS OWNER. Callers pass `aad` (we use the account id), so a
//    ciphertext lifted from one account's row cannot be replayed into another's.
//    Without that, a row-level write anywhere near this table becomes a way to
//    point one account's sync at another account's password.

const VERSION = 'v1';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard; do NOT reuse an IV with the same key
const TAG_BYTES = 16;

/**
 * Parse the configured key. Accepts base64 or hex, and requires exactly 32
 * bytes — a short key is a silent downgrade to a weaker cipher, so it throws.
 */
export function parseKey(raw) {
  const s = String(raw ?? '').trim();
  if (!s) throw new Error('secretbox: no key configured (SYNC_CRED_KEY)');
  const buf = /^[0-9a-fA-F]+$/.test(s) && s.length === KEY_BYTES * 2
    ? Buffer.from(s, 'hex')
    : Buffer.from(s, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`secretbox: key must be ${KEY_BYTES} bytes (got ${buf.length})`);
  }
  return buf;
}

/**
 * True when sealing is possible. Same gating shape as mailer/redis: unconfigured
 * is a supported state, and the routes that need a credential say so explicitly
 * rather than storing something they cannot protect.
 */
export function secretboxEnabled(raw) {
  try {
    parseKey(raw);
    return true;
  } catch {
    return false;
  }
}

/** A fresh 32-byte key, base64 — for generating the value that goes into SSM. */
export function generateKey() {
  return randomBytes(KEY_BYTES).toString('base64');
}

/**
 * Encrypt. Returns 'v1.<iv>.<tag>.<ciphertext>', all base64url, so the whole
 * thing is one safe TEXT column value. The version prefix is what makes key
 * rotation possible later without guessing at old rows.
 */
export function seal(plaintext, keyRaw, aad = '') {
  const key = parseKey(keyRaw);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(String(aad), 'utf8'));
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

/**
 * Decrypt. Throws on a wrong key, a tampered value, a mismatched `aad`, or an
 * unknown version — every one of those is "do not use this secret", so none of
 * them may return a value. Callers treat a throw as "credential unusable".
 */
export function open(sealed, keyRaw, aad = '') {
  const key = parseKey(keyRaw);
  const parts = String(sealed ?? '').split('.');
  if (parts.length !== 4) throw new Error('secretbox: malformed ciphertext');
  const [version, ivB64, tagB64, ctB64] = parts;
  // Constant-time on the version too — it costs nothing and keeps the whole
  // parse free of early-outs that vary with attacker-supplied input.
  const vGiven = Buffer.from(version, 'utf8');
  const vWant = Buffer.from(VERSION, 'utf8');
  if (vGiven.length !== vWant.length || !timingSafeEqual(vGiven, vWant)) {
    throw new Error(`secretbox: unsupported version '${version}'`);
  }
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('secretbox: malformed ciphertext');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  if (aad) decipher.setAAD(Buffer.from(String(aad), 'utf8'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]);
  return pt.toString('utf8');
}
