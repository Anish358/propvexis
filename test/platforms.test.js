import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORMS, PLATFORM_IDS, IMPORT_METHODS,
  findPlatform, platformSupports, autoSyncPlatforms,
} from '../src/domain/sync/platforms.js';

// Two fields carry different meanings and are easy to conflate:
//   enabled       -- may be CHOSEN in the wizard at all
//   connector     -- non-null means Auto Sync is available for it
// 'other' is enabled with no connector: a trader whose platform is absent must
// still have a way through the flow.

test('ids are unique and non-empty', () => {
  const ids = PLATFORMS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9_]+$/);
  assert.deepEqual(PLATFORM_IDS, ids);
});

test('every platform is fully described — no half-filled row', () => {
  for (const p of PLATFORMS) {
    assert.ok(p.label, `${p.id} needs a label`);
    assert.ok(Array.isArray(p.importMethods) && p.importMethods.length, `${p.id} needs importMethods`);
    assert.ok(Array.isArray(p.assetTypes), `${p.id} needs assetTypes`);
    assert.ok(Array.isArray(p.credentialFields), `${p.id} needs credentialFields`);
    assert.equal(typeof p.enabled, 'boolean', `${p.id} enabled must be boolean`);
    assert.ok(p.connector === null || typeof p.connector === 'string', `${p.id} connector`);
  }
});

test('every declared import method is one the schema allows', () => {
  // The CHECK in 0026 admits exactly these four; a fifth here would 400 at
  // provision or, worse, violate the constraint at insert.
  assert.deepEqual(IMPORT_METHODS, ['auto_sync', 'ea', 'file', 'manual']);
  for (const p of PLATFORMS) {
    for (const m of p.importMethods) {
      assert.ok(IMPORT_METHODS.includes(m), `${p.id} offers unknown method ${m}`);
    }
  }
});

test('only a platform with a connector may offer auto_sync', () => {
  // This is the honesty rule. Offering Auto Sync where no connector exists is a
  // dead end at the last step of a nine-step flow.
  for (const p of PLATFORMS) {
    if (p.importMethods.includes('auto_sync')) {
      assert.ok(p.connector, `${p.id} offers auto_sync with no connector`);
    }
  }
});

test('a platform with no connector still offers a way in', () => {
  for (const p of PLATFORMS.filter((x) => !x.connector)) {
    assert.ok(
      p.importMethods.includes('file') || p.importMethods.includes('manual'),
      `${p.id} cannot auto-sync and offers no manual route — it is a dead end`,
    );
  }
});

test('mt5 is the one platform that can Auto Sync in Phase A', () => {
  assert.deepEqual(autoSyncPlatforms().map((p) => p.id), ['mt5']);
});

test('mt4 exists but cannot Auto Sync — the EA is .mq5 and the farm is MT5-only', () => {
  const mt4 = findPlatform('mt4');
  assert.ok(mt4, 'mt4 must be listed; plenty of prop accounts are MT4 and CSV import works');
  assert.equal(mt4.connector, null);
  assert.equal(mt4.importMethods.includes('auto_sync'), false);
  assert.equal(mt4.importMethods.includes('ea'), false, 'the EA cannot attach to MT4');
});

test('ctrader and tradelocker are listed but not yet connectable', () => {
  for (const id of ['ctrader', 'tradelocker']) {
    const p = findPlatform(id);
    assert.ok(p, `${id} must be listed so the catalog is the real roadmap`);
    assert.equal(p.connector, null);
    assert.equal(p.enabled, false);
  }
});

test('mt5 credential fields describe server, login and password', () => {
  const fields = findPlatform('mt5').credentialFields;
  assert.deepEqual(fields.map((f) => f.name), ['server', 'login', 'password']);
  const password = fields.find((f) => f.name === 'password');
  assert.equal(password.secret, true, 'the password must be marked secret so no page logs or persists it');
  assert.equal(password.type, 'password');
  for (const f of fields) assert.equal(f.required, true);
});

test('mt5 states the read-only rule as the checked fact it is', () => {
  // This copy must live on the connector, not in a page: TradeLocker has no
  // investor-password concept, so P2 must not be able to inherit the promise.
  assert.match(findPlatform('mt5').credentialNote, /investor|read-only/i);
});

test('a platform with no credential fields carries no credential note', () => {
  for (const p of PLATFORMS.filter((x) => x.credentialFields.length === 0)) {
    assert.equal(p.credentialNote, null, `${p.id} promises something it never collects`);
  }
});

test('PLATFORMS is frozen deep enough that a consumer cannot mutate the authority', () => {
  // Four modules import PLATFORMS as THE authority (see the file's own header
  // comment); a push onto a nested array would corrupt it for every other
  // importer in the process, silently and at a distance.
  assert.ok(Object.isFrozen(PLATFORMS), 'the top-level array must be frozen');
  assert.throws(() => PLATFORMS.push({ id: 'nope' }), TypeError);
  for (const p of PLATFORMS) {
    assert.ok(Object.isFrozen(p), `${p.id} object must be frozen`);
    assert.ok(Object.isFrozen(p.importMethods), `${p.id}.importMethods must be frozen`);
    assert.ok(Object.isFrozen(p.assetTypes), `${p.id}.assetTypes must be frozen`);
    assert.ok(Object.isFrozen(p.credentialFields), `${p.id}.credentialFields must be frozen`);
    for (const f of p.credentialFields) {
      assert.ok(Object.isFrozen(f), `${p.id} credentialFields entries must be frozen too`);
    }
    assert.throws(() => p.importMethods.push('x'), TypeError, `${p.id}.importMethods must reject a push`);
  }
});

test('findPlatform and platformSupports fail safe on unknown input', () => {
  assert.equal(findPlatform('nope'), null);
  assert.equal(findPlatform(undefined), null);
  assert.equal(platformSupports('nope', 'file'), false);
  assert.equal(platformSupports('mt5', 'teleport'), false);
  assert.equal(platformSupports('mt5', 'auto_sync'), true);
  assert.equal(platformSupports('tradelocker', 'auto_sync'), false);
});
