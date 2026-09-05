// Worker entry point. Two lines, in this exact order, and for the same reason
// src/server.js has them:
//
//   1. Hydrate secrets from AWS SSM into process.env (prod only; a no-op unless
//      SSM_PREFIX is set).
//   2. THEN import the worker, which reads process.env.
//
// A plain static import would be hoisted above the await and the worker would
// start with no CTRADER_CLIENT_ID on the box, fail its own startup check, and
// look like a missing SSM parameter rather than an ordering bug.
// Local dev reads .env, exactly as platform/config.js does. On the box SSM_PREFIX
// is set and hydrateSecrets supplies everything instead, so this is a no-op there.
import 'dotenv/config';
import { hydrateSecrets } from '../../src/platform/secrets.js';

await hydrateSecrets();
const { start } = await import('./index.js');
start();
