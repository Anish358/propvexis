import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';

import { repoRoot } from '../src/platform/paths.js';

// ESLint covers the one failure mode this suite cannot reach: an identifier that is
// CALLED but never imported. Such a module loads fine, so nothing here fails — the
// ReferenceError arrives per-request inside a handler (`financeSummary` on
// /api/prop/finance, live for weeks) or on the render of one page (`titleCase` in
// Billing.jsx, live in prod until this config's first run).
//
// This file pins the two halves that can each fail silently: the rule being on for
// both trees, and the lint actually RUNNING in CI. The second matters as much as the
// first — ci.yml's own header records that a check which never ran looks exactly
// like a check that passed.
//
// It needs `eslint` from devDependencies. That is how CI runs (`npm ci`); the box
// installs with `--omit=dev` and never runs tests.

const file = (rel) => path.join(repoRoot, rel);
const read = (rel) => readFileSync(file(rel), 'utf8');

// calculateConfigForFile normalises severities to numbers, so accept either form
// rather than asserting the shape of ESLint's own return value.
const severity = (rules, name) => {
  const entry = rules?.[name];
  return Array.isArray(entry) ? entry[0] : entry;
};
const isError = (rules, name) => severity(rules, name) === 2 || severity(rules, name) === 'error';

test('eslint.config.js exists at the repo root', () => {
  assert.ok(existsSync(file('eslint.config.js')), 'flat config missing');
});

test('no-undef is an error for backend, tests, tooling and the frontend', async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  // One file from each config block, so a block that stops matching is caught.
  const cases = [
    'src/routes/prop.js',            // the route layer — victim #1 lived here
    'src/domain/prop/propOverview.js',
    'scripts/migrate.js',
    'test/eslint.test.js',
    'ecosystem.config.cjs',          // CommonJS on purpose (pm2 requires it)
    'frontend/src/features/billing/Billing.jsx', // victim #3 lived here
    'frontend/src/features/accounts/newAccountFlow.js',
  ];
  for (const rel of cases) {
    assert.ok(existsSync(file(rel)), `${rel} moved — update this list`);
    const config = await eslint.calculateConfigForFile(file(rel));
    assert.ok(isError(config.rules, 'no-undef'), `no-undef is not an error for ${rel}`);
  }
});

test('the rule really fires — a called-but-unimported identifier is reported', async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  // A pin nothing verifies is worth nothing, so reproduce the bug in both trees
  // rather than trusting the resolved config.
  const cases = [
    ['src/routes/__probe.js', 'export function handler() { return financeSummary(1); }\n'],
    ['frontend/src/features/billing/__probe.jsx', 'export const P = () => <b>{titleCase("pro")}</b>;\n'],
  ];
  for (const [rel, code] of cases) {
    const [result] = await eslint.lintText(code, { filePath: file(rel) });
    const undef = result.messages.filter((m) => m.ruleId === 'no-undef');
    assert.equal(undef.length, 1, `no-undef did not fire in ${rel}: ${JSON.stringify(result.messages)}`);
  }
});

test('frontend code cannot reach `process` — Vite only substitutes NODE_ENV', async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  // Deliberate: `process` is left undeclared for the frontend so that any
  // `process.env.X` other than the NODE_ENV form Vite rewrites is reported here
  // instead of throwing in a browser. Declaring the global would hide it.
  const [result] = await eslint.lintText(
    'export const base = process.env.VITE_API_URL;\n',
    { filePath: file('frontend/src/lib/__probe.js') },
  );
  assert.ok(
    result.messages.some((m) => m.ruleId === 'no-undef' && m.message.includes('process')),
    'process is declared as a frontend global — it must not be',
  );

  // Control: a real browser global must NOT be reported, or the config is useless.
  const [ok] = await eslint.lintText(
    'export const w = () => window.location.href;\n',
    { filePath: file('frontend/src/lib/__probe.js') },
  );
  assert.deepEqual(ok.messages.filter((m) => m.ruleId === 'no-undef'), []);
});

test('the lint runs in CI and in the pre-deploy gate', () => {
  assert.match(read('package.json'), /"lint":\s*"eslint \."/, 'npm run lint missing');

  // Both workflows, because they are separate gates: ci.yml is the red check on the
  // PR, deploy-env.yml is the last thing between `main` and the box.
  assert.match(read('.github/workflows/ci.yml'), /npm run lint/, 'ci.yml does not lint');
  assert.match(read('.github/workflows/deploy-env.yml'), /npm run lint/, 'deploy-env.yml does not lint');
});
