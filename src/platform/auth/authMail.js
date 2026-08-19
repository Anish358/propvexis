import { appLink, sendMail } from '../mailer.js';

// The two messages the auth flows send. Copy lives beside auth rather than in
// platform/mailer.js so the mailer stays a transport with no idea what the
// product is — same split as db.js vs the domain modules.
//
// Every message is plain text first with an HTML twin. Plain text is not a
// fallback nicety here: a password-reset mail that renders as a blank page in a
// text-only client is a locked-out user, and spam filters treat HTML-only
// transactional mail worse.

const wrap = (heading, lines, cta) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0a0a0b;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#ededee">
  <div style="max-width:480px;margin:0 auto">
    <p style="font-size:15px;font-weight:600;letter-spacing:.02em;color:#3b82f6;margin:0 0 24px">PropVexis</p>
    <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;color:#ededee">${heading}</h1>
    ${lines.map((l) => `<p style="font-size:14px;line-height:1.6;color:#9a9aa0;margin:0 0 12px">${l}</p>`).join('')}
    <p style="margin:24px 0">
      <a href="${cta.href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:8px">${cta.label}</a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:#6a6a70;margin:0">
      If the button doesn't work, paste this into your browser:<br>
      <span style="color:#9a9aa0;word-break:break-all">${cta.href}</span>
    </p>
  </div>
</body></html>`;

/**
 * Confirm an address. Sent on password signup and on demand from the in-app
 * banner. Grants nothing on its own, so the 24h TTL is generous by design.
 */
export function sendVerificationMail({ to, name, token }, log) {
  const href = appLink('/verify', { token });
  const hello = name ? `Hi ${name},` : 'Hi,';
  return sendMail({
    to,
    subject: 'Confirm your email — PropVexis',
    text: [
      hello,
      '',
      'Confirm this address to finish setting up your PropVexis account.',
      '',
      href,
      '',
      'The link works for 24 hours. If you did not create a PropVexis account,',
      'you can ignore this email.',
    ].join('\n'),
    html: wrap('Confirm your email', [
      'Confirm this address to finish setting up your PropVexis account.',
      'The link works for 24 hours. If you did not create a PropVexis account, you can ignore this email.',
    ], { href, label: 'Confirm email' }),
  }, log);
}

/**
 * Reset a password.
 *
 * `hasPassword` is false for an account that only ever used Google — including
 * one whose password was revoked by the Google-link rule in auth.js. That case
 * is not an error: the reset is exactly how such a user gets password access
 * back, so the copy explains the situation rather than refusing.
 */
export function sendPasswordResetMail({ to, name, token, hasPassword = true }, log) {
  const href = appLink('/reset', { token });
  const hello = name ? `Hi ${name},` : 'Hi,';
  const context = hasPassword
    ? 'Someone asked to reset the password for your PropVexis account.'
    : 'Someone asked to reset the password for your PropVexis account. This account currently signs in with Google — you can keep doing that, or set a password below to have both.';
  return sendMail({
    to,
    subject: 'Reset your PropVexis password',
    text: [
      hello,
      '',
      context,
      '',
      href,
      '',
      'The link works for 1 hour and can only be used once. If this was not you,',
      'ignore this email — your password has not changed.',
    ].join('\n'),
    html: wrap('Reset your password', [
      context,
      'The link works for 1 hour and can only be used once. If this was not you, ignore this email — your password has not changed.',
    ], { href, label: 'Choose a new password' }),
  }, log);
}
