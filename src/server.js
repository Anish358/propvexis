// Entry point. Two lines, in this exact order:
//
//   1. Hydrate secrets from AWS SSM Parameter Store into process.env (prod only;
//      a no-op unless SSM_PREFIX is set — see src/secrets.js).
//   2. Dynamically import the app, whose first import chain (instrument.js →
//      config.js) reads process.env *synchronously at import time*.
//
// The dynamic import MUST come after `await hydrateSecrets()` so config.js sees
// the SSM-sourced values. A plain static `import './app.js'` would be hoisted and
// evaluated before the await, defeating the whole thing. Keeping the app in a
// separate module (app.js) means package.json's start command is unchanged, so
// the box's pm2 process needs no reconfiguration.
import { hydrateSecrets } from './secrets.js';

await hydrateSecrets();
await import('./app.js');
