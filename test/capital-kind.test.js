import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { propAccountsOnly } from '../src/domain/accounts/accounts.js';
import { onlyPropCapital } from '../frontend/src/features/prop/propAccounts.js';
import { readSrc } from './helpers/src-files.js';

// Route handlers cannot be exercised without an HTTP harness this repo does not
// have, so what is asserted here is that the route file WIRES the tested pure
// functions in — the same approach test/routes-split.test.js takes. The behaviour
// itself is pinned by provision.test.js and provision-tx.test.js.
const accountsRoute = readFileSync(new URL('../src/routes/accounts.js', import.meta.url), 'utf8');

test('provision is registered on the root app with requireAuth', () => {
  assert.match(accountsRoute, /app\.post\(\s*'\/api\/accounts\/provision'/);
  const handler = accountsRoute.slice(accountsRoute.indexOf("'/api/accounts/provision'"));
  assert.match(handler.slice(0, 200), /preHandler:\s*app\.requireAuth/);
  // Whether route modules are actually called rather than app.register()-ed is a
  // structural invariant enforced across every route file by
  // test/routes-split.test.js ("route modules are called, never registered as
  // plugins"). A file-wide text scan for the literal `app.register(` here would
  // add no coverage that test doesn't already give, and it is a false-positive
  // magnet: the module's own explanatory comment above has every reason to name
  // that exact API when describing what NOT to do.
});

test('provision delegates to the tested pure functions rather than re-deciding', () => {
  for (const fn of ['validateProvision', 'provisionGate', 'provisionAccount']) {
    assert.ok(accountsRoute.includes(fn), `${fn} is not used — the policy would be untested`);
  }
});

test('provision refuses Auto Sync when credentials cannot be encrypted', () => {
  // Storing a broker password we cannot encrypt is worse than not offering the
  // feature; sync.js already returns 503 for this and provision must agree.
  assert.ok(accountsRoute.includes('credentialsEnabled'));
  assert.match(accountsRoute, /503/);
});

test('provision maps a login collision to 409, not 500', () => {
  assert.ok(accountsRoute.includes('PROVISION_CONFLICT'));
  assert.match(accountsRoute, /409/);
});

test('login-available never reveals another tenant account', () => {
  const idx = accountsRoute.indexOf("'/api/accounts/login-available'");
  assert.ok(idx > -1, 'the route is missing');
  // Anchor on the HANDLER'S OWN boundary — its route registration's closing
  // `});` — rather than a fixed byte count. A fixed window necessarily spills
  // into whatever sits next in the file (a neighbouring route's comment, say),
  // so a negative assertion over it is really testing that neighbour, not this
  // handler; it also couples the result to route order, which is incidental.
  const rest = accountsRoute.slice(idx);
  const close = /^\s{2}\}\);/m.exec(rest);
  assert.ok(close, 'could not find the end of the login-available handler');
  const handler = rest.slice(0, close.index + close[0].length);
  // It answers "can you use this login" and, only for the caller's own account,
  // "it is yours". Anything more is an enumeration oracle for other users' logins.
  assert.match(handler, /available/);
  assert.match(handler, /mine/);
  assert.equal(/label|ingest_token|user_id:/.test(handler), false,
    'no other-tenant detail may leave this endpoint');
});

test('the legacy POST /api/accounts forwards firm_id and product_id', () => {
  // This was a live bug: the handler never destructured firm_id, so the firm
  // picked in the template picker was dropped on create while PATCH saved it.
  const post = accountsRoute.slice(
    accountsRoute.indexOf("app.post('/api/accounts'"),
    accountsRoute.indexOf("app.patch('/api/accounts/:id'"),
  );
  for (const f of ['firm_id', 'firm_name', 'product_id', 'capital_kind']) {
    assert.ok(post.includes(f), `POST /api/accounts still drops ${f}`);
  }
});

test('no account creation path gives a live account a challenge', () => {
  // The fake-challenge bug. Both creation paths must guard it: provisionAccount
  // does so structurally (provision-tx.test.js), and the legacy POST needs the
  // same condition.
  const post = accountsRoute.slice(
    accountsRoute.indexOf("app.post('/api/accounts'"),
    accountsRoute.indexOf("app.patch('/api/accounts/:id'"),
  );
  const call = post.indexOf('createChallengeForAccount');
  assert.ok(call > -1, 'the legacy path still needs to create a challenge for prop accounts');
  assert.match(post.slice(Math.max(0, call - 200), call), /capital_kind/,
    'createChallengeForAccount must be guarded on capital_kind');
});

test('propAccountsOnly keeps prop accounts and drops live ones', () => {
  const rows = [
    { id: 1, capital_kind: 'prop' },
    { id: 2, capital_kind: 'live' },
    { id: 3, capital_kind: 'prop' },
  ];
  assert.deepEqual(propAccountsOnly(rows).map((a) => a.id), [1, 3]);
});

test('propAccountsOnly treats a missing capital_kind as prop', () => {
  // Belt and braces for a row read before migration 0026 lands, or a fixture that
  // predates the column. Dropping such a row would empty a real trader's Prop OS.
  assert.deepEqual(propAccountsOnly([{ id: 1 }, { id: 2, capital_kind: null }]).map((a) => a.id), [1, 2]);
});

test('propAccountsOnly is total — empty and absent input give an empty list', () => {
  assert.deepEqual(propAccountsOnly([]), []);
  assert.deepEqual(propAccountsOnly(undefined), []);
  assert.deepEqual(propAccountsOnly(null), []);
});

test('every prop route handler that calls listAccounts filters through propAccountsOnly', () => {
  // A file-wide COUNT of listAccounts(...) vs propAccountsOnly(...) proves nothing
  // about co-location: it would pass if one handler filtered twice and a sibling
  // handler with its own listAccounts call filtered zero times, and it is inflated
  // by any unrelated propAccountsOnly( text elsewhere in the file (a comment, a
  // future call in an unrelated route). So this walks each handler's OWN body —
  // from its `app.<verb>(` registration to that SAME registration's closing
  // `});` (the /^\s{2}\}\);/m anchor this file already uses for login-available,
  // never a fixed byte window that could spill into a neighbour) — and requires
  // any handler whose body calls listAccounts(req.user.uid) to also contain
  // propAccountsOnly( inside that same slice. Miss one and a live account is
  // silently counted as an evaluation account on a Prop OS surface — no error,
  // no 500, just a wrong number on the Overview/Portfolio/Finance cards.
  const propRoute = readFileSync(new URL('../src/routes/prop.js', import.meta.url), 'utf8');
  assert.ok(propRoute.includes('propAccountsOnly'), 'the helper is not imported');

  const starts = [...propRoute.matchAll(/^\s{2}app\.\w+\(/gm)].map((m) => m.index);
  assert.ok(starts.length > 0, 'no route handlers found — the anchor regex is stale');

  const totalCalls = [...propRoute.matchAll(/listAccounts\(req\.user\.uid\)/g)].length;
  let coveredCalls = 0;
  for (const start of starts) {
    const rest = propRoute.slice(start);
    const close = /^\s{2}\}\);/m.exec(rest);
    assert.ok(close, 'could not find the end of a route handler');
    const handler = rest.slice(0, close.index + close[0].length);
    const callsHere = [...handler.matchAll(/listAccounts\(req\.user\.uid\)/g)].length;
    coveredCalls += callsHere;
    if (callsHere > 0) {
      assert.ok(/propAccountsOnly\(/.test(handler),
        `a handler calls listAccounts(req.user.uid) without filtering it through propAccountsOnly:\n${handler.slice(0, 300)}`);
    }
  }
  // Every occurrence in the file must have been inside exactly one handler slice —
  // otherwise a call sitting outside any slice (the anchor missing a handler
  // entirely) would silently escape the per-handler check above.
  assert.equal(coveredCalls, totalCalls,
    'a listAccounts(req.user.uid) call sits outside every handler slice — the anchor missed it');
});

test('onlyPropCapital matches the server helper exactly', () => {
  // Two implementations of one rule, because the client filters the outlet
  // context and the server filters its own query. They must agree, including on
  // the missing-column case.
  const rows = [{ id: 1, capital_kind: 'prop' }, { id: 2, capital_kind: 'live' }, { id: 3 }];
  assert.deepEqual(onlyPropCapital(rows).map((a) => a.id), propAccountsOnly(rows).map((a) => a.id));
  assert.deepEqual(onlyPropCapital(undefined), []);
});

test('every Prop OS page filters the SAME list it renders as `accounts`', () => {
  // A bare `assert.match(src, /onlyPropCapital/)` proves only that the identifier
  // appears somewhere in the file — it would still pass if onlyPropCapital filtered
  // some unused local while the page went on rendering the raw outlet-context list.
  // So this requires, per page: the outlet context's `accounts` was renamed on the
  // way in (there is no unrenamed `accounts` left to leak through), and THAT SAME
  // renamed identifier is the one argument to onlyPropCapital, assigned back to the
  // `accounts` the rest of the component reads.
  //
  // What this still does not prove: that every render path actually uses the
  // resulting `accounts` rather than reaching back into outlet context under some
  // other alias, or that `useOutletContext()` was destructured only once. Given
  // this repo's one-outlet-context-call-per-page convention (true of all four
  // pages read here), that gap does not arise in practice.
  for (const page of ['PropOS.jsx', 'PropAccounts.jsx', 'PropChallenges.jsx', 'Finance.jsx']) {
    const src = readSrc(page);
    const destructure = /accounts:\s*(\w+)\s*=\s*\[\]/.exec(src);
    assert.ok(destructure, `${page} does not rename accounts out of the outlet context — it can still read the raw list as \`accounts\``);
    const raw = destructure[1];
    const filtered = new RegExp(`const accounts = useMemo\\(\\(\\) => onlyPropCapital\\(${raw}\\)`);
    assert.match(src, filtered, `${page} must filter ${raw} into the \`accounts\` identifier the rest of the page renders`);
  }
});

test('the account switcher does NOT filter — a live account is still journalable', () => {
  // The inverse assertion, so a later "fix" cannot quietly hide live accounts from
  // the picker and make their trades unreachable.
  assert.equal(/onlyPropCapital/.test(readSrc('Layout.jsx')), false,
    'the shell must not filter the switcher');
});

test('the Settings accounts table names the capital kind before the prop type', () => {
  const src = readSrc('SettingsAccounts.jsx');
  // TYPE_LABEL is defined once at module scope and used once, inside the Type
  // cell. A plain `src.indexOf('TYPE_LABEL')` finds the DEFINITION, thousands of
  // characters above the cell markup, so a fixed window from there would never
  // reach `capital_kind` no matter how the cell is written. So this anchors on the
  // usage (the second occurrence) and walks back to that JSX element's own opening
  // `<td`, the same own-boundary principle this file already applies to route
  // handlers — then requires capital_kind to appear before TYPE_LABEL inside that
  // one cell, proving the capital-kind check actually gates the prop-type label
  // rather than merely appearing somewhere else in the file.
  const first = src.indexOf('TYPE_LABEL');
  const second = src.indexOf('TYPE_LABEL', first + 1);
  assert.ok(second > first, 'TYPE_LABEL is used only once — the Type cell markup moved or was removed');
  const cellStart = src.lastIndexOf('<td', second);
  assert.match(src.slice(cellStart, second), /capital_kind/,
    'the Type cell keys off account_type alone, so a live account reads "Evaluation"');
});
