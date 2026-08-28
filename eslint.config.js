// ESLint exists in this repo for exactly ONE bug class, and saying so up front is
// what keeps this file from drifting into a style debate:
//
//   A module that calls an identifier it never imported still LOADS cleanly.
//   The ReferenceError fires later — per request, inside a handler, or on the
//   render of one page.
//
// `npm test` (node:test) is structurally blind to that. It pins pure functions and
// SQL text, never serves a request and never mounts a component. `vite build` only
// catches a missing NAMED EXPORT, not a bare undefined identifier. So "the suite is
// green" has now been no evidence at all three times:
//
//   1. `src/routes/prop.js` called `financeSummary` without importing it after the
//      route split. `GET /api/prop/finance` threw on EVERY request for weeks.
//   2. `AccountForms.jsx` was written with `export { eaAllowed } from './accountGating.js'`,
//      which adds an indirect export for external importers and creates NO local
//      binding — so that file's own `eaAllowed(...)` call would have thrown and
//      blanked the add/edit-account dialog behind the error boundary. It passed 983
//      tests and a clean `npm run build`; a human reading the diff caught it.
//   3. `Billing.jsx` called `titleCase(current)` and never imported it — found by
//      the first run of THIS config, on code already live in prod.
//
// Hence `no-undef`, and deliberately nothing else. There is no `extends` and no
// recommended set: in flat config no rule runs unless it is named here, so this
// file is zero-noise by construction and can never fail on formatting. Turning on
// more rules (`react-hooks/exhaustive-deps` alone reports 13 real findings) is a
// separate, deliberate decision — not something a feature PR should smuggle in.

import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    // `agent/` is Python. `frontend/dist` is build output. `frontend/.preview*` and
    // `.ssr-*` are the gitignored screenshot harness — an UNTRACKED file must never
    // be able to fail the lint, because CI would never see it and a local run would
    // then disagree with the check on the PR.
    ignores: [
      '**/node_modules/**',
      'frontend/dist/**',
      'frontend/.preview*',
      'frontend/.ssr-*',
      'frontend/.mk-preview.mjs',
      'terraform/**',
    ],
  },

  {
    // Backend + tooling: ESM (package.json is `type: module`) with Node globals.
    files: ['src/**/*.js', 'scripts/**/*.js', 'test/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: { 'no-undef': 'error' },
  },

  {
    // pm2 reads this one with require(), so it is CommonJS on purpose.
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: { 'no-undef': 'error' },
  },

  {
    // Frontend: browser globals, and JSX has to be switched on explicitly — espree
    // parses it, but only when asked.
    //
    // `process` is deliberately NOT declared here. Vite substitutes
    // `process.env.NODE_ENV` and nothing else, so any other `process.env.X` in
    // browser code is a runtime crash — leaving the global undeclared is what makes
    // this config catch it. Use `import.meta.env`, which is what the rest of the
    // frontend already does.
    //
    // The limit worth knowing: `no-undef` catches an undefined identifier in a CALL,
    // which is the bug class above. An undefined JSX *component* is not reliably
    // reported without a React plugin.
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // react-hooks is registered ONLY so the `eslint-disable-next-line
    // react-hooks/exhaustive-deps` comments already in the code resolve to a known
    // rule — an unknown rule in a disable directive is a hard ERROR in ESLint 9+,
    // whatever else is configured. The rule itself stays OFF: those comments record
    // an intent that predates any linter, and switching the rule on is the separate
    // decision described at the top of this file.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
    // With the rule off, every one of those directives suppresses nothing, and a
    // wall of "unused disable directive" warnings would bury the one thing this
    // config is here to report.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
]
