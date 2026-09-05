import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode, readSrc } from './helpers/src-files.js';

const shell = readCode('NewAccountFlow.jsx');
const connect = readCode('ConnectStep.jsx');

test('THE CALLBACK PARAMS ARE READ BY THE SHELL, NOT BY THE STEP', () => {
  /* THE BUG THIS CATCHES, WHICH SHIPPED TO PROD.
   *
   * The cTrader callback redirects to `/accounts/new?ctrader=connected&identity=N`.
   * That lands on FlowIndex, which does
   * `<Navigate to={`/accounts/new/${firstIncomplete(draft)}`} replace />` — and
   * <Navigate> does NOT carry location.search. So the query string is gone before
   * ConnectStep ever mounts.
   *
   * ConnectStep read the params with useSearchParams(), saw nothing, and rendered
   * "Authorize with cTrader" again. The user clicked Allow access on cTrader's
   * consent screen, came back, and was asked to authorize a second time forever —
   * while the identity HAD been created server-side each time.
   *
   * The shell is mounted for every step and sees the entry location, which is why
   * it is already where `challenge` and `phase` are read. The cTrader return
   * belongs there for exactly the same reason. */
  assert.match(shell, /ctrader/i, 'the shell must capture the cTrader return');
  assert.match(shell, /ctrader_identity_id/,
    'the shell must write the identity into the draft, which survives navigation');
  assert.equal(/useSearchParams/.test(connect), false,
    'the step must NOT read the query — it is dropped before the step mounts');
});

test('the step reads the connection from the DRAFT, which survives navigation', () => {
  assert.match(connect, /draft\.ctrader_identity_id/);
});

test('FlowIndex still drops the query — so nothing may depend on it downstream', () => {
  // Documenting the constraint rather than changing it: carrying search through
  // every wizard redirect would leak stale params between steps. The shell
  // consuming them once, on entry, is the fix.
  assert.match(shell, /<Navigate to=\{`\/accounts\/new\/\$\{firstIncomplete\(draft\)\}`\}/);
});

test('a failed or denied return is surfaced, not silently swallowed', () => {
  /* `?ctrader=error&reason=expired` arrives on the same query string that gets
   * dropped, so it needs the same treatment as the success case — otherwise a
   * denied or expired grant looks identical to never having clicked at all.
   *
   * The shell CAPTURES the outcome (status + reason, not just the identity); the
   * STEP renders it. Asserting it on the shell alone would pass while the user
   * still saw nothing. */
  assert.match(shell, /status: q\.get\('ctrader'\)|q\.get\('ctrader'\)/,
    'the shell must capture the status, not only a connected identity');
  assert.match(shell, /reason: q\.get\('reason'\)/, 'and the reason with it');
  assert.match(connect, /ctraderReturn\?\.status === 'error'/,
    'the step must render the failure it is handed');
  assert.match(connect, /ctraderReturn\?\.reason === 'expired'/,
    'an expired grant gets its own wording — it is retryable, a denial is not');
});

test('a second authorization retires the first, instead of breaking discovery', async () => {
  /* THE FAILURE THIS PREVENTS. The callback creates a NEW identity every time the
   * consent screen completes — it must, because the token pair is new and the cTID
   * is unknown until discovery. Rows with ctid_user_id = NULL coexist fine, since
   * NULLs do not collide in a unique index.
   *
   * They collide the moment discovery learns the real cTID:
   * uq_ctrader_identities_live is UNIQUE (user_id, ctid_user_id) WHERE revoked_at
   * IS NULL. The second setCtid raises 23505 and discovery fails PERMANENTLY, with
   * nothing in the UI able to say why. Authorizing twice is enough — which is
   * exactly what a trader does when the first attempt looks like it did nothing. */
  const { supersedeDuplicateIdentitiesQuery } = await import('../src/domain/sync/ctraderIdentities.js');
  const q = supersedeDuplicateIdentitiesQuery(7, 4242);
  assert.deepEqual(q.values, [7, 4242]);
  assert.match(q.text, /SET revoked_at = now\(\)/, 'revoked, not deleted — accounts keep their FK');
  assert.match(q.text, /id <> \$1/, 'the row being discovered must survive');
  assert.match(q.text, /revoked_at IS NULL/, 'only live rows can collide on the index');
  assert.match(q.text, /user_id = \(SELECT user_id FROM ctrader_identities WHERE id = \$1\)/,
    'scoped to ONE user — never retire a stranger\'s identity for sharing a cTID');
});

test('the supersede runs BEFORE setCtid, not after', async () => {
  // After is too late: setCtid is the statement that raises 23505.
  // readSrc is scoped to frontend/src, so the backend route is read directly.
  const { readFileSync } = await import('node:fs');
  const path = (await import('node:path')).default;
  const { repoRoot } = await import('../src/platform/paths.js');
  const route = readFileSync(path.join(repoRoot, 'src/routes/ctrader.js'), 'utf8');
  const supersedeAt = route.indexOf('supersedeDuplicateIdentities(id');
  const setCtidAt = route.indexOf('setCtid(id, ctidUserId)');
  assert.ok(supersedeAt > 0 && setCtidAt > 0, 'both calls must exist');
  assert.ok(supersedeAt < setCtidAt, 'the duplicate must be retired first');
});
