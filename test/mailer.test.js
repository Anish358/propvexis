import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appLink, mailerConfigGaps, mailerEnabled, sendMail } from '../src/platform/mailer.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const mailer = read('../src/platform/mailer.js');

test('mail is enabled only when BOTH the sender and the link origin are set', () => {
  const base = { mailFrom: 'no-reply@propvexis.com', appBaseUrl: 'https://app.propvexis.com' };
  assert.equal(mailerEnabled(base), true);
  assert.deepEqual(mailerConfigGaps(base), []);

  // A half-configured mailer must be reported, not silently downgraded to
  // log-only — the exact trap the Razorpay go-live audit found in billing.
  assert.equal(mailerEnabled({ ...base, mailFrom: '' }), false);
  assert.deepEqual(mailerConfigGaps({ ...base, mailFrom: '' }), ['MAIL_FROM']);
  // A verification link pointing at localhost is worse than no mail at all.
  assert.equal(mailerEnabled({ ...base, appBaseUrl: '' }), false);
  assert.deepEqual(mailerConfigGaps({ ...base, appBaseUrl: '' }), ['APP_BASE_URL']);
  assert.deepEqual(mailerConfigGaps({ mailFrom: '', appBaseUrl: '' }), ['MAIL_FROM', 'APP_BASE_URL']);
});

test('links are built from config, never from a request header', () => {
  const cfg = { appBaseUrl: 'https://app.propvexis.com' };
  assert.equal(
    appLink('/reset', { token: 'abc' }, cfg),
    'https://app.propvexis.com/reset?token=abc'
  );
  // Tokens are URL-encoded on the way in, so a value can't break out of the
  // query string.
  assert.equal(
    appLink('/verify', { token: 'a b&c=d' }, cfg),
    'https://app.propvexis.com/verify?token=a+b%26c%3Dd'
  );
  assert.equal(appLink('/verify', {}, cfg), 'https://app.propvexis.com/verify');

  // The origin comes from config only. A Host/Origin header would let an
  // attacker have the reset link mailed pointing at their own domain.
  const config = read('../src/platform/config.js');
  assert.ok(!mailer.includes('req.headers'), 'the mailer must not read request headers');
  assert.match(config, /appBaseUrl: \(process\.env\.APP_BASE_URL/, 'the origin is an env var');
  // In production an unset value stays empty rather than falling back to the
  // dev localhost, and mailerEnabled() then reports mail as off. Guessing an
  // origin is what turns this into a host-header bug.
  assert.match(config, /APP_BASE_URL \?\? \(isProd \? '' : 'http:\/\/localhost:5173'\)/);
  assert.equal(mailerEnabled({ mailFrom: 'a@b.com', appBaseUrl: '' }), false);
});

test('an unconfigured mailer logs the link instead of throwing', async () => {
  const lines = [];
  const log = { info: (obj, msg) => lines.push({ obj, msg }), error: () => {} };
  const res = await sendMail({
    to: 'trader@example.com',
    subject: 'Reset your PropVexis password',
    text: 'https://app.propvexis.com/reset?token=xyz',
  }, log);

  assert.deepEqual(res, { sent: false, reason: 'not-configured' });
  assert.equal(lines.length, 1);
  // The link must be in the log, or a developer can't finish the flow locally.
  assert.match(lines[0].obj.body, /token=xyz/);
});

test('sendMail can never reject — a mail outage must not 500 an auth route', () => {
  // The whole body is inside try/catch and every exit is a resolved object.
  assert.match(mailer, /\} catch \(err\) \{[\s\S]*?return \{ sent: false, reason: 'send-failed' \};/);
  const body = mailer.slice(
    mailer.indexOf('export async function sendMail'),
    mailer.indexOf('export function reportMailerConfig')
  );
  assert.ok(!/throw /.test(body), 'sendMail must not throw');
  // Both exits are resolved objects, so a caller can branch on the result
  // rather than needing a try/catch around it.
  assert.equal((body.match(/return \{ sent: (true|false)/g) || []).length, 3);
});

test('the SES client is imported lazily', () => {
  // A static import would cost every deployment the SDK's startup time,
  // including the many that never send mail.
  assert.ok(!/^import .*client-sesv2/m.test(mailer), 'no top-level SES import');
  assert.match(mailer, /await import\('@aws-sdk\/client-sesv2'\)|import\('@aws-sdk\/client-sesv2'\)/);
  // A failed import must not poison the module for every later attempt.
  assert.match(mailer, /clientPromise = null;\s*\/\/ let a later send retry/);
});
