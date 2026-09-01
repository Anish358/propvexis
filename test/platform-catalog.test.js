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

test('the credential form is mirrored, field for field, into the UI catalog', () => {
  /* THE DRIFT THIS CATCHES. ConnectStep renders the credential form from the UI
   * catalog, because the frontend cannot import src/domain. The backend then
   * validates what comes back with the connector's own validateCredential. If the
   * two field lists disagree, the form collects the wrong things and the user is
   * refused by a 400 they cannot act on — asking for an MT5 login on a platform
   * whose credential is an email, say. Same arrangement as importMethods above. */
  for (const c of PLATFORM_CARDS) {
    const authority = findPlatform(c.id);
    assert.deepEqual(
      (c.credentialFields || []).map((f) => ({ name: f.name, type: f.type, required: f.required })),
      authority.credentialFields.map((f) => ({ name: f.name, type: f.type, required: f.required })),
      `${c.id}: the two catalogs disagree about the credential form`,
    );
  }
});

test('the credential COPY is mirrored too — the note and the consent gate', () => {
  // The note is a per-platform security claim. MT5 promises a trade-capable
  // password is rejected; TradeLocker says outright that no read-only credential
  // exists. Letting the UI carry its own wording is how one platform's promise
  // gets shown above another platform's password field.
  for (const c of PLATFORM_CARDS) {
    const authority = findPlatform(c.id);
    assert.equal(c.credentialNote ?? null, authority.credentialNote ?? null,
      `${c.id}: the credential note differs between the catalogs`);
    assert.equal(c.credentialConsent ?? null, authority.credentialConsent ?? null,
      `${c.id}: the consent gate differs between the catalogs`);
  }
});

test('a platform that collects a password says something about it', () => {
  // A password field with no note is a bare ask for a broker credential. Whatever
  // the platform's security story is, it has to be ON the field.
  for (const c of PLATFORM_CARDS) {
    if (!(c.credentialFields || []).some((f) => f.type === 'password')) continue;
    assert.ok(c.credentialNote, `${c.id} asks for a password and explains nothing`);
  }
});

test('a consent gate exists exactly where the credential can trade', () => {
  /* The rule, stated once so it cannot drift: a gate is required when and only
   * when we cannot promise the credential is read-only. MT5's worker checks
   * trade_allowed and deletes a credential that can trade, so its note is a
   * checked fact and a tick-box would be ceremony. TradeLocker offers no
   * read-only credential at all, so the trader must actively affirm what they
   * are handing over. Getting this backwards in either direction is the bug. */
  for (const c of PLATFORM_CARDS) {
    const note = c.credentialNote || '';
    const claimsReadOnly = /investor|read-only password/i.test(note) && !/no read-only/i.test(note);
    if (!(c.credentialFields || []).some((f) => f.type === 'password')) {
      assert.equal(c.credentialConsent ?? null, null, `${c.id} gates a credential it never collects`);
      continue;
    }
    if (claimsReadOnly) {
      assert.equal(c.credentialConsent ?? null, null,
        `${c.id} promises a read-only credential, so a consent gate would be theatre`);
    } else {
      assert.ok(c.credentialConsent,
        `${c.id} cannot promise the credential is read-only, so it MUST gate on consent`);
      assert.match(c.credentialConsent, /trade/i,
        `${c.id}: the thing being consented to is that the credential can TRADE — say so`);
    }
  }
});
