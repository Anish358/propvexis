import { config } from './config.js';

// Transactional email, used today only by the auth flows (verify an address,
// reset a password).
//
// Two rules, both borrowed from platform/redis.js because the failure modes are
// the same shape:
//
// 1. DEGRADE, DON'T DIE. sendMail never throws and never rejects. A mail
//    provider outage must not turn "reset my password" into a 500, and it must
//    never take a route down — the caller gets `{ sent: false }` and decides.
// 2. UNCONFIGURED IS A SUPPORTED STATE. With MAIL_FROM unset the app behaves
//    exactly as it did before this module existed, except that the link that
//    would have been mailed is logged instead. That is what makes the whole
//    flow developable and testable locally with no AWS account.
//
// Transport is AWS SES v2 through the EC2 instance role, so there are no
// credentials to store — only a region and a From identity verified in SES.

export const mailerStatus = {
  configured: false,
  provider: 'none',
  sent: 0,
  failed: 0,
  logged: 0,          // would-have-sent, while unconfigured
  lastError: null,
};

/**
 * True when a real send is possible. Requires BOTH a verified From address and
 * a link origin: mailing a verification link that points at localhost is worse
 * than not mailing at all, because the user sees a broken product rather than a
 * missing feature.
 */
export function mailerEnabled(cfg = config) {
  return Boolean(cfg.mailFrom && cfg.appBaseUrl);
}

/**
 * Names what is missing, for a boot-time warning. Returns [] when enabled, so a
 * partial configuration is reported specifically rather than as a silent
 * fallback to log-only — the same trap the Razorpay go-live audit found.
 */
export function mailerConfigGaps(cfg = config) {
  const gaps = [];
  if (!cfg.mailFrom) gaps.push('MAIL_FROM');
  if (!cfg.appBaseUrl) gaps.push('APP_BASE_URL');
  return gaps;
}

/**
 * Absolute URL into the frontend for an emailed link.
 * Path is ours, the token is appended encoded; the origin is config, never a
 * request header (see config.appBaseUrl).
 */
export function appLink(path, params = {}, cfg = config) {
  const qs = new URLSearchParams(params).toString();
  return `${cfg.appBaseUrl}${path}${qs ? `?${qs}` : ''}`;
}

// The SES client is created on first use, not at import: importing the SDK
// costs real startup time, and a deployment with mail unconfigured should never
// pay it. Held in a module-level promise so concurrent first sends share one.
let clientPromise = null;
function sesClient() {
  if (!clientPromise) {
    clientPromise = import('@aws-sdk/client-sesv2')
      .then(({ SESv2Client, SendEmailCommand }) => ({
        client: new SESv2Client({ region: config.awsRegion }),
        SendEmailCommand,
      }))
      .catch((err) => {
        clientPromise = null;                     // let a later send retry the import
        throw err;
      });
  }
  return clientPromise;
}

/**
 * Send one message.
 *
 * @returns {Promise<{sent: boolean, reason?: string}>} — resolved always, never
 * rejected. `reason` is for logs and tests, not for users: the callers of this
 * module deliberately return the same response whether or not mail went out, so
 * that /api/auth/password/forgot can't be used to enumerate accounts.
 */
export async function sendMail({ to, subject, text, html }, log) {
  if (!mailerEnabled()) {
    mailerStatus.logged += 1;
    // The link is in `text`. At info level so a developer can complete the flow
    // from the server log; this branch cannot be reached in a configured
    // production environment.
    log?.info({ to, subject, body: text }, 'mail not configured — logging instead of sending');
    return { sent: false, reason: 'not-configured' };
  }

  try {
    const { client, SendEmailCommand } = await sesClient();
    await client.send(new SendEmailCommand({
      FromEmailAddress: config.mailFrom,
      Destination: { ToAddresses: [to] },
      ...(config.mailReplyTo ? { ReplyToAddresses: [config.mailReplyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
          },
        },
      },
    }));
    mailerStatus.sent += 1;
    mailerStatus.configured = true;
    mailerStatus.provider = 'ses';
    log?.info({ to, subject }, 'mail sent');
    return { sent: true };
  } catch (err) {
    // Never rethrow: see rule 1. The user-visible flow continues, and the
    // failure is visible in logs, Sentry (via the caller) and mail_send_failures.
    mailerStatus.failed += 1;
    mailerStatus.lastError = err?.message ?? String(err);
    log?.error({ err: mailerStatus.lastError, to, subject }, 'mail send failed');
    return { sent: false, reason: 'send-failed' };
  }
}

/** Boot-time report, called from app.js alongside the other config warnings. */
export function reportMailerConfig(log) {
  const gaps = mailerConfigGaps();
  mailerStatus.configured = gaps.length === 0;
  mailerStatus.provider = gaps.length === 0 ? 'ses' : 'none';
  if (gaps.length === 0) {
    log?.info({ from: config.mailFrom, region: config.awsRegion }, 'transactional email enabled (SES)');
  } else {
    log?.warn({ missing: gaps },
      'transactional email disabled — verification and password-reset links will be logged, not sent');
  }
}
