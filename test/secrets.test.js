import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyParams } from '../src/platform/secrets.js';

test('maps each param to its last path segment', () => {
  const env = {};
  const applied = applyParams(
    [
      { Name: '/amey-journal/prod/SESSION_SECRET', Value: 's3cret' },
      { Name: '/amey-journal/prod/DATABASE_URL', Value: 'postgres://x' },
    ],
    env,
  );
  assert.deepEqual(env, { SESSION_SECRET: 's3cret', DATABASE_URL: 'postgres://x' });
  assert.deepEqual(applied.sort(), ['DATABASE_URL', 'SESSION_SECRET']);
});

test('set-if-absent: does not clobber an already-set env var', () => {
  const env = { NODE_ENV: 'production' };
  const applied = applyParams(
    [
      { Name: '/amey-journal/prod/NODE_ENV', Value: 'staging' },
      { Name: '/amey-journal/prod/INGEST_TOKEN', Value: 'tok' },
    ],
    env,
  );
  assert.equal(env.NODE_ENV, 'production', 'existing env var wins over SSM');
  assert.equal(env.INGEST_TOKEN, 'tok');
  assert.deepEqual(applied, ['INGEST_TOKEN'], 'only newly-set keys are reported');
});

test('handles empty / missing input without throwing', () => {
  assert.deepEqual(applyParams([], {}), []);
  assert.deepEqual(applyParams(undefined, {}), []);
});

test('skips params with no name or empty last segment; missing value becomes empty string', () => {
  const env = {};
  const applied = applyParams(
    [
      { Name: '', Value: 'x' },
      { Name: '/amey-journal/prod/', Value: 'y' },
      { Name: '/amey-journal/prod/EMPTY' }, // no Value
    ],
    env,
  );
  assert.deepEqual(env, { EMPTY: '' });
  assert.deepEqual(applied, ['EMPTY']);
});
