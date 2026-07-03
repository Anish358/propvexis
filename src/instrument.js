// Sentry initialization — MUST be imported before any other module in the entry
// point (server.js line 1) so the SDK can instrument http/pg/etc. as they load.
// A no-op when SENTRY_DSN is unset, so local/dev and unconfigured environments
// run with zero Sentry overhead and need no account.
import * as Sentry from '@sentry/node';
import { config } from './config.js';

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    release: config.release || undefined,
    // Errors are always captured; sample a slice of transactions for perf.
    tracesSampleRate: 0.1,
    // Don't ship request bodies/headers by default (trades + tokens are sensitive).
    sendDefaultPii: false,
  });
}

export { Sentry };
