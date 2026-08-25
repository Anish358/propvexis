import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_CARDS, findPlatformCard, searchPlatforms,
} from '../frontend/src/features/accounts/platformCatalog.js';
import {
  PLATFORM_IDS, IMPORT_METHODS, findPlatform,
} from '../src/domain/sync/platforms.js';

// THE DRIFT TEST. There are two platform catalogs because the backend cannot
// import frontend/src (deploy rsyncs `src db scripts ea` plus `frontend/dist`, so
// such an import works locally and crashes on the box). This file is what stops
// them disagreeing — the same trick nav.test.js uses for routes versus nav.
//
// A backend test may import a frontend module only while that module is pure
// data: CI installs backend dependencies only, so importing anything that pulls
// React would fail here and nowhere else.

test('both catalogs name exactly the same platforms', () => {
  assert.deepEqual(PLATFORM_CARDS.map((c) => c.id).sort(), [...PLATFORM_IDS].sort());
});

test('a platform the UI calls live is one the backend will accept', () => {
  for (const c of PLATFORM_CARDS.filter((x) => x.status === 'live')) {
    assert.equal(findPlatform(c.id).enabled, true,
      `the UI offers ${c.id} but provision would 400 on it`);
  }
});

test('a platform the UI badges soon is one the backend refuses', () => {
  for (const c of PLATFORM_CARDS.filter((x) => x.status === 'soon')) {
    assert.equal(findPlatform(c.id).enabled, false,
      `${c.id} is badged Soon but the backend would accept it`);
  }
});

test('a Soon platform never offers Auto Sync on either side', () => {
  for (const c of PLATFORM_CARDS.filter((x) => x.status === 'soon')) {
    assert.equal(c.importMethods.includes('auto_sync'), false, `${c.id} card offers auto_sync`);
    assert.equal(findPlatform(c.id).connector, null, `${c.id} has a connector but is badged Soon`);
  }
});

test('both catalogs agree, per platform, on which import methods are offered', () => {
  // The likeliest drift: shipping a connector and updating only one file, so the
  // UI hides a route that works or offers one that does not exist.
  for (const c of PLATFORM_CARDS) {
    assert.deepEqual([...c.importMethods].sort(), [...findPlatform(c.id).importMethods].sort(),
      `${c.id}: the two catalogs disagree about import methods`);
  }
});

test('every card is fully described and uses only the four known methods', () => {
  for (const c of PLATFORM_CARDS) {
    assert.ok(c.name, `${c.id} needs a name`);
    // A BLURB IS NO LONGER REQUIRED (2026-08-25): the explanation text came out of the
    // wizard, cards included. `status` is what has to be right instead, because it is
    // what tells a user why a card cannot be chosen — rendered as a Soon badge inside
    // the card's own button, so it reaches the accessible name rather than sitting in a
    // sentence beside it. A card with neither a blurb nor a status IS a bare name.
    assert.ok(['live', 'soon'].includes(c.status), `${c.id} needs a status — it is the only thing left that says why a card is greyed out`);
    assert.equal(typeof c.blurb, 'string', `${c.id}: blurb stays a string, even when empty`);
    for (const m of c.importMethods) assert.ok(IMPORT_METHODS.includes(m), `${c.id}: ${m}`);
  }
});

test('every card offers at least one route in, so no card is a dead end', () => {
  for (const c of PLATFORM_CARDS) {
    assert.ok(c.importMethods.length > 0, `${c.id} offers no way to get trades in`);
  }
});

test('findPlatformCard fails safe', () => {
  assert.equal(findPlatformCard('mt5').name, 'MetaTrader 5');
  assert.equal(findPlatformCard('nope'), null);
  assert.equal(findPlatformCard(undefined), null);
});

test('search is case-insensitive, matches substrings, and returns all on empty', () => {
  assert.deepEqual(searchPlatforms('meta').map((c) => c.id), ['mt5', 'mt4']);
  assert.deepEqual(searchPlatforms('LOCKER').map((c) => c.id), ['tradelocker']);
  assert.deepEqual(searchPlatforms('').length, PLATFORM_CARDS.length);
  assert.deepEqual(searchPlatforms('   ').length, PLATFORM_CARDS.length);
  assert.deepEqual(searchPlatforms(undefined).length, PLATFORM_CARDS.length);
  assert.deepEqual(searchPlatforms('zzz'), []);
});

test('search also matches the platform id, so typing "mt5" works', () => {
  assert.deepEqual(searchPlatforms('mt5').map((c) => c.id), ['mt5']);
});

test('an empty-query result is a copy, not the live PLATFORM_CARDS reference', () => {
  // A Phase B caller doing `searchPlatforms(q).sort(...)` must not be able to
  // reorder the catalog for the whole session just because q happened to be ''.
  const result = searchPlatforms('');
  assert.notEqual(result, PLATFORM_CARDS, 'must be a fresh array, not the same reference');
  result.reverse();
  assert.notDeepEqual(PLATFORM_CARDS.map((c) => c.id), result.map((c) => c.id));
});
