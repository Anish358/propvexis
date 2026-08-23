import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IMPORT_BODY_LIMIT, csvSizeVerdict, initialImportState, importReducer, previewSummary,
} from '../frontend/src/features/trades/csvImportFlow.js';

// The CSV import sequence is now driven by two surfaces — the modal reached from
// the trade log, and the Add Account wizard's upload step — so the sequence lives
// here once (spec §8.3: extracted, not copied). The markup stays each surface's
// own; what is shared is the state machine and the guards.

test('the client size limit is the server bodyLimit, read from the route', () => {
  // Two numbers naming one fact drift. This reads the server's own literal, so
  // raising the bodyLimit without raising the client guard fails here.
  const route = readFileSync(new URL('../src/routes/trades.js', import.meta.url), 'utf8');
  const m = /bodyLimit:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(route);
  assert.ok(m, 'could not find the import route bodyLimit — has it moved?');
  assert.equal(IMPORT_BODY_LIMIT, Number(m[1]) * 1024 * 1024);
});

test('a comfortable file passes', () => {
  assert.deepEqual(csvSizeVerdict(2 * 1024 * 1024), { ok: true, error: null });
  assert.deepEqual(csvSizeVerdict(0), { ok: true, error: null });
});

test('a file that JSON escaping would push over the limit is refused BEFORE upload', () => {
  // The CSV rides inside a JSON body, so escaping inflates it. Refusing at the
  // limit itself would still 413 after a long upload; the margin is what makes
  // the message honest.
  const verdict = csvSizeVerdict(IMPORT_BODY_LIMIT);
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /MB/, 'the message must name a size the user can compare against');
});

test('the size message never asks the user to guess', () => {
  const verdict = csvSizeVerdict(IMPORT_BODY_LIMIT * 4);
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /split|smaller|shorter|date/i,
    'refusing a statement without saying what to do is a dead end');
});

test('csvSizeVerdict is total', () => {
  for (const bad of [undefined, null, NaN, -1, 'x']) {
    assert.equal(typeof csvSizeVerdict(bad).ok, 'boolean', String(bad));
  }
});

test('the initial state has nothing loaded and nothing in flight', () => {
  const s = initialImportState();
  assert.equal(s.csv, '');
  assert.equal(s.fileName, '');
  assert.equal(s.preview, null);
  assert.equal(s.done, null);
  assert.equal(s.error, null);
  assert.equal(s.busy, false);
});

test('loading a file clears a previous preview, result and error', () => {
  // Otherwise the counts from the PREVIOUS file stay on screen beside the new
  // file's name, and the user confirms an import of numbers that no longer apply.
  const loaded = importReducer(
    { ...initialImportState(), preview: { willImport: 5 }, done: { imported: 5 }, error: 'old' },
    { type: 'file', fileName: 'statement.csv', csv: 'a,b\n1,2' },
  );
  assert.equal(loaded.fileName, 'statement.csv');
  assert.equal(loaded.csv, 'a,b\n1,2');
  assert.equal(loaded.preview, null);
  assert.equal(loaded.done, null);
  assert.equal(loaded.error, null);
});

test('a preview arriving clears busy and any error', () => {
  const s = importReducer(
    { ...initialImportState(), busy: true, error: 'earlier' },
    { type: 'preview', preview: { willImport: 12, duplicates: 1, skipped: 0 } },
  );
  assert.equal(s.busy, false);
  assert.equal(s.error, null);
  assert.equal(s.preview.willImport, 12);
});

test('an error clears busy but KEEPS the loaded file', () => {
  // The user should be able to retry without picking the file again.
  const s = importReducer(
    { ...initialImportState(), busy: true, csv: 'a,b', fileName: 'x.csv' },
    { type: 'error', error: 'server said no' },
  );
  assert.equal(s.busy, false);
  assert.equal(s.error, 'server said no');
  assert.equal(s.csv, 'a,b');
  assert.equal(s.fileName, 'x.csv');
});

test('a finished import clears the preview, so no confirm button survives it', () => {
  const s = importReducer(
    { ...initialImportState(), preview: { willImport: 12 }, busy: true },
    { type: 'imported', result: { imported: 12, duplicates: 0, skipped: 0 } },
  );
  assert.equal(s.done.imported, 12);
  assert.equal(s.preview, null, 'a surviving preview means a second Import button');
  assert.equal(s.busy, false);
});

test('reset returns exactly the initial state', () => {
  const dirty = importReducer(initialImportState(), { type: 'file', fileName: 'a', csv: 'b' });
  assert.deepEqual(importReducer(dirty, { type: 'reset' }), initialImportState());
});

test('an unknown action returns the SAME state object, not a copy', () => {
  // Identity, so a stray dispatch cannot trigger a re-render loop in a component
  // whose effect depends on the state object.
  const s = initialImportState();
  assert.equal(importReducer(s, { type: 'nope' }), s);
  assert.equal(importReducer(s, {}), s);
});

test('importReducer never mutates the state it was given', () => {
  const before = initialImportState();
  const snapshot = JSON.parse(JSON.stringify(before));
  importReducer(before, { type: 'file', fileName: 'a.csv', csv: 'x' });
  assert.deepEqual(before, snapshot);
});

test('previewSummary defaults every count and refuses an empty import', () => {
  assert.deepEqual(previewSummary({ willImport: 7, duplicates: 2, skipped: 1 }),
    { willImport: 7, duplicates: 2, skipped: 1, canImport: true });
  assert.deepEqual(previewSummary({ willImport: 0, duplicates: 9, skipped: 0 }),
    { willImport: 0, duplicates: 9, skipped: 0, canImport: false });
  assert.deepEqual(previewSummary({}), { willImport: 0, duplicates: 0, skipped: 0, canImport: false });
  assert.deepEqual(previewSummary(null), { willImport: 0, duplicates: 0, skipped: 0, canImport: false });
});
