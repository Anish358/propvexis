import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEP_IDS, emptyDraft, firstIncomplete, isStepComplete, patchDraft, suggestedLabel,
  toProvisionPayload,
} from '../frontend/src/features/accounts/newAccountFlow.js';
import {
  findFirm, findProduct, templateToFields, wizardProducts,
} from '../frontend/src/features/prop/propFirms.js';
import { readCode, readSrc, allSrcFiles, appJsx, srcExists } from './helpers/src-files.js';
import { autoSyncGate, KNOWN_PLANS } from '../frontend/src/features/accounts/accountGating.js';

// The eleven wizard pages cannot be rendered here — no jsdom, no React Testing
// Library, by decision — so what is asserted is structure: the routes exist, the
// wizard sits OUTSIDE <Layout>, the guard lives in one place, no page writes a
// Tailwind class that silently compiles to nothing, and no page can leak a
// password into the draft.

// readCode, not readSrc: both the route-nesting walk and the sessionStorage check are
// claims about what the code DOES, and both were first satisfied by a COMMENT — App.jsx
// documents the wizard as "a SIBLING of <Layout>", and the shell's own header explains
// that it uses sessionStorage rather than localStorage. See helpers/src-files.js.
const app = readCode('App.jsx');
const shell = readCode('NewAccountFlow.jsx');
const stepFiles = () => allSrcFiles().filter((f) => f.startsWith('features/accounts/steps/'));

test('every step id has a route, and every route is a step id', () => {
  // A step in stepsFor() with no <Route> is a redirect to a blank page; a <Route>
  // with no step is dead.
  const declared = [...app.matchAll(/<Route\s+path="([a-z]+)"/g)]
    .map((m) => m[1])
    .filter((p) => STEP_IDS.includes(p));
  for (const id of STEP_IDS) {
    assert.ok(declared.includes(id), `no <Route path="${id}"> in App.jsx`);
  }
});

test('the wizard is a SIBLING of Layout, so it has no sidebar and no filter bar', () => {
  // Spec §8.1. Nested inside the Layout route the wizard would render through
  // Layout's <Outlet>, inheriting the shell's chrome AND its outlet context, and
  // the whole full-bleed design would be gone.
  //
  // Nesting is the thing being asserted, so it is MEASURED rather than guessed at
  // from distances or indentation: this walks forward from the Layout route's own
  // opening `<Route`, counting nested `<Route` elements in and `</Route>` out, and
  // stops at the tag that closes it. A self-closing `/>` opens and closes in one
  // tag and so never changes depth.
  const layoutOpen = app.lastIndexOf('<Route', app.indexOf('<Layout'));
  assert.ok(layoutOpen > -1, 'could not find the Layout route');

  let depth = 0;
  let layoutEnd = -1;
  const tag = /<Route\b[\s\S]*?(\/>|>)|<\/Route>/g;
  tag.lastIndex = layoutOpen;
  for (let m = tag.exec(app); m; m = tag.exec(app)) {
    if (m[0] === '</Route>') depth -= 1;
    else if (m[1] === '>') depth += 1;      // an opening tag with children
    if (depth === 0) { layoutEnd = m.index + m[0].length; break; }
  }
  assert.ok(layoutEnd > layoutOpen, 'could not find the tag that closes the Layout route');

  // `wizardRoutes` is a function, so its own JSX lives elsewhere in the file —
  // what matters is where it is CALLED. `...wizardRoutes(` only, because matching
  // the bare name would also hit `function wizardRoutes(`.
  const calls = [...app.matchAll(/\.\.\.wizardRoutes\(/g)].map((m) => m.index);
  assert.ok(calls.length >= 1, 'wizardRoutes is never spread into <Routes>');
  for (const at of calls) {
    assert.equal(at > layoutOpen && at < layoutEnd, false,
      'a wizardRoutes() call sits inside the Layout route — the wizard must be a sibling');
  }
});

test('the wizard takes the three things App owns, since it has no outlet context', () => {
  // Spec §8.1: reloadAccounts, setAccountId and accounts come from App as props,
  // because a sibling of <Layout> gets no outlet context.
  const open = app.indexOf('path="/accounts/new"');
  assert.ok(open > -1, 'the wizard route is missing');
  const registration = app.slice(open, app.indexOf('</Route>', open));
  for (const prop of ['accounts', 'reloadAccounts', 'setAccountId']) {
    assert.ok(registration.includes(prop), `the wizard route does not pass ${prop}`);
  }
});

test('the guard lives in the shell, once, not in eleven pages', () => {
  assert.match(shell, /canVisit\(/, 'the shell must gate on canVisit');
  assert.match(shell, /firstIncomplete\(/, 'the shell must know where to send a rejected visit');
  const offenders = stepFiles().filter((f) => /canVisit\(|firstIncomplete\(/.test(readSrc(f)));
  assert.deepEqual(offenders, [],
    'a step re-implements the guard — it belongs in the shell, where one copy cannot drift from itself');
});

test('the shell mirrors the draft to sessionStorage under the versioned key', () => {
  // Spec §6.1: a mid-flow refresh resumes, and the draft dies with the tab.
  assert.match(shell, /sessionStorage/);
  assert.match(shell, /DRAFT_KEY/, 'the key must come from the flow module, not be retyped');
  assert.equal(/localStorage/.test(shell), false,
    'localStorage outlives the tab — an abandoned draft would greet the user days later');
});

test('the provision key is minted with crypto.randomUUID, once', () => {
  // provision_key is UNIQUE globally while its lookup is per-user, so a guessable
  // or shared key lets one user's draft occupy the index slot another user needs.
  assert.match(shell, /crypto\.randomUUID\(\)/);
  assert.equal((shell.match(/crypto\.randomUUID\(\)/g) || []).length, 1,
    'minted in exactly one place — a second call per attempt defeats the idempotency guard');
});

test('no step component holds the broker password in the draft', () => {
  // Spec §6.1: sessionStorage is readable by any script on the origin, so the
  // password lives in component state and goes straight to the provision call.
  for (const f of stepFiles()) {
    const src = readSrc(f);
    for (const m of src.matchAll(/patch\(\{([^}]*)\}/g)) {
      assert.equal(/password|secret/i.test(m[1]), false,
        `${f} patches a password into the draft: patch({${m[1]}})`);
    }
  }
});

test('no wizard file writes a Tailwind utility, which would compile to nothing', () => {
  // tailwind.css scopes @source to components/{ui,primitives} ONLY. A utility
  // class written in a page emits no CSS and fails silently — the element simply
  // renders unstyled, which no reviewer catches by eye. This is also what forces
  // the component-first build order: the only way to style a page is to compose
  // components that live where Tailwind can see them.
  const UTILITY = /className="[^"]*\b(?:flex|grid|hidden|block|p-\d|px-\d|py-\d|m-\d|mx-\d|my-\d|gap-\d|w-full|h-full|text-(?:sm|xs|lg|xl)|font-(?:medium|semibold|bold)|rounded(?:-\w+)?|border(?:-\w+)?|bg-\w+|items-center|justify-\w+)\b/;
  const files = [...stepFiles(), 'features/accounts/NewAccountFlow.jsx'];
  const offenders = files.filter((f) => UTILITY.test(readSrc(f)));
  assert.deepEqual(offenders, [],
    'these write Tailwind utilities that will not compile — compose primitives instead');
});

test('every wizard navigation target is an absolute path', () => {
  const files = [...stepFiles(), 'features/accounts/NewAccountFlow.jsx'];
  for (const f of files) {
    for (const m of readSrc(f).matchAll(/\bto=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
      const target = m[1] ?? m[2];
      assert.ok(target.startsWith('/'), `${f}: to="${target}" must be absolute`);
    }
  }
});

test('the capital step offers exactly the two kinds the column admits', () => {
  const src = readSrc('CapitalStep.jsx');
  assert.match(src, /'prop'/);
  assert.match(src, /'live'/);
  // migration 0026's CHECK is `capital_kind IN ('prop','live')`. A third card
  // would 400 at provision after the user answered eight more questions.
  const kinds = [...src.matchAll(/capital_kind:\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(kinds)].sort(), ['live', 'prop']);
});

// ---------------------------------------------------------------------------
// The two assertions that hold the COMPONENT-FIRST build order. The plan for this
// task originally styled these pages with hand-written `.naf-*` rules in
// styles/legacy/app.css; DESIGN-LANGUAGE §1 supersedes that, because the preset's
// styling arrives THROUGH registry components and a hand-rolled equivalent is
// off-foundation by construction.

test('the wizard adds NO hand-written CSS — it composes components instead', () => {
  // The whole point of the eleven pages is to be the worked example that a feature
  // can be built with zero additions to the 4,470-line legacy stylesheet. A `.naf-`
  // rule appearing here means the pattern was abandoned quietly.
  const css = readSrc('styles/legacy/app.css');
  assert.equal(/\.naf-/.test(css), false,
    'a .naf-* rule was added to legacy/app.css — style this by composing a component under components/primitives, which is where Tailwind actually compiles');
});

test('wizard files import components only through the primitives barrel', () => {
  // primitives/index.js: "application code imports from @/components/primitives.
  // Nothing outside this directory imports from @/components/ui." components/ui is
  // generated and regenerable — a `shadcn add --overwrite` or a preset change can
  // rewrite any file in it, so a page importing it directly has unbounded blast
  // radius on every regeneration.
  const files = [...stepFiles(), 'features/accounts/NewAccountFlow.jsx'];
  const offenders = files.filter((f) => /from '@\/components\/ui/.test(readSrc(f)));
  assert.deepEqual(offenders, [],
    'these import generated components directly — go through @/components/primitives');
});

// ---- Task 8: name and platform ---------------------------------------------
// readCode throughout: every claim below is about what the page DOES, and these are
// exactly the files whose comments explain the rules being asserted.

test('the name step offers the suggested label rather than inventing one', () => {
  const src = readCode('NameStep.jsx');
  assert.match(src, /suggestedLabel\(/);
  assert.equal(/firm_name\s*\+|`\$\{.*firm/.test(src), false,
    'the page must not compose its own label — suggestedLabel is tested, a template string is not');
});

test('the name step never overwrites what the user typed', () => {
  // The suggestion seeds the input; it is not re-applied. Overwriting a typed label
  // because a later step changed is how a user loses their own text.
  const src = readCode('NameStep.jsx');
  assert.match(src, /useState\(/, 'the input is local state seeded once, not derived every render');
});

test('the platform step reads the presentation catalog, not the backend registry', () => {
  // src/domain/sync/platforms.js is the authority and the frontend cannot import it
  // (the deploy ships the two trees separately). platformCatalog.js is the
  // presentation half and platform-catalog.test.js keeps them in step.
  const src = readCode('PlatformStep.jsx');
  assert.match(src, /platformCatalog/);
  assert.equal(/domain\/sync\/platforms/.test(src), false,
    'the page must never import backend source — it works locally and crashes on the box');
});

test('the platform step cannot select a Soon platform', () => {
  // provision 400s on any platform whose `enabled` is false, so an enabled card would
  // be a dead end after the user answered six questions.
  const src = readCode('PlatformStep.jsx');
  assert.match(src, /status/, "the card's status must gate selection");
  assert.match(src, /'soon'/);
});

test('the platform step narrows to the firm on the prop path', () => {
  // Spec §7.2: for a prop account the firm implies the platform, with the rest behind
  // "show all".
  const src = readCode('PlatformStep.jsx');
  assert.match(src, /findFirm\(/);
  assert.match(src, /platforms/);
});

test('only the live path collects a broker, and it is free text', () => {
  // Spec §7.2 and §4: `broker` is free text on the Live path. toProvisionPayload nulls
  // it for prop, so collecting it there would be discarded input.
  const src = readCode('PlatformStep.jsx');
  assert.match(src, /broker/);
  assert.match(src, /capital_kind/, 'the broker field must be gated on the capital kind');
});

test('a Soon platform stays FINDABLE even though it cannot be chosen', () => {
  // platformCatalog.js's own header: the catalog reads as a roadmap. Filtering the
  // soon cards out of search would turn "when is cTrader coming" into "cTrader does
  // not exist", which is a worse answer than a disabled card with its blurb.
  const src = readCode('PlatformStep.jsx');
  const searchCall = /searchPlatforms\([^)]*\)/.exec(src);
  assert.ok(searchCall, 'the step must search through searchPlatforms');
  assert.equal(/searchPlatforms\([^)]*\)\s*\.filter\([^)]*status/.test(src), false,
    'the search result must not be filtered by status — soon cards stay findable');
});

// ---- Task 7: the prop branch -----------------------------------------------

test('the firm step renders only firms the wizard can complete', () => {
  // A firm whose every product is unverified would be a card leading to an empty
  // product page. wizardFirms() already drops those; this is what stops the page
  // reaching past it to the raw catalog.
  const src = readCode('FirmStep.jsx');
  assert.match(src, /wizardFirms\(/);
  assert.equal(/\bPROP_FIRMS\b/.test(src), false,
    'the firm step must not read the raw catalog — it would offer unverified-only firms');
});

test('the product step renders only verified or custom products', () => {
  // THE ONE THAT MATTERS. GFT 1-Step and Instant Funding carry verified: false with
  // drawdown percentages nobody has checked against the firm, and a wrong drawdown
  // does not fail loudly — it mis-scores a real trader's account for the length of a
  // challenge.
  const src = readCode('ProductStep.jsx');
  assert.match(src, /wizardProducts\(/);
  assert.equal(/\.products\b/.test(src), false,
    'the product step must not read firm.products directly — that includes unverified rules');
});

test('the product step resolves its rules through templateToFields', () => {
  // Not by reading phase objects itself. templateToFields enforces size membership
  // and the eval/funded target-vs-split split, and it is tested.
  assert.match(readCode('PhaseStep.jsx'), /templateToFields\(/);
});

test('the custom product gets inputs, not defaults', () => {
  const src = readCode('ProductStep.jsx');
  assert.match(src, /isCustomProduct\(/, 'the step must branch on the custom product');
  for (const field of ['daily_dd_pct', 'max_dd_pct', 'start_balance']) {
    assert.ok(src.includes(field), `the custom editor does not collect ${field}`);
  }
});

test('no wizard step hardcodes a drawdown percentage', () => {
  // Every number a challenge is judged against comes from the catalog or from the
  // user. A literal here is an invented rule with nothing pinning it.
  for (const f of stepFiles()) {
    const src = readCode(f);
    for (const m of src.matchAll(/(daily_dd_pct|max_dd_pct|profit_target_pct):\s*([0-9.]+)/g)) {
      assert.fail(`${f} hardcodes ${m[1]}: ${m[2]} — rules come from the catalog or the user`);
    }
  }
});

test('the phase step offers only the three values challenges.phase accepts', () => {
  const src = readCode('PhaseStep.jsx');
  assert.match(src, /PHASES/, 'the phase list must come from the flow module, not be retyped');
  const literals = [...src.matchAll(/phase:\s*'(\w+)'/g)].map((m) => m[1]);
  for (const p of literals) {
    assert.ok(['p1', 'p2', 'funded'].includes(p), `${p} is not a phase the schema accepts`);
  }
});

test('the phase step derives account_type from the phase rather than asking twice', () => {
  // Two controls naming one fact drift. The phase decides it: p1/p2 are eval, funded
  // is funded, and that is what templateToFields already returns.
  const src = readCode('PhaseStep.jsx');
  assert.match(src, /account_type/);
  assert.equal(/<select[^>]*account_type|name="account_type"/.test(src), false,
    'account_type must not be a control — the phase decides it');
});

test('the unlisted firm cannot advance without a typed name', () => {
  // firm_name feeds suggestedLabel and every Prop OS display, and "Other / not
  // listed" is useless in both. COMPLETE.firm enforces it; the page must agree rather
  // than being optimistic and having the guard bounce the user back.
  const src = readCode('FirmStep.jsx');
  assert.match(src, /UNLISTED_FIRM_ID|'other'/, 'the step must know which firm is the escape hatch');
  assert.match(src, /firm_name/);
});

test('no step patches firm_name for a CATALOG firm — it is derived', () => {
  // patchDraft derives firm_name from the catalog for every firm it names, so a page
  // sending its own is a second writer for one fact. The escape hatch is the one
  // exception, because its name is the user's to type.
  const src = readCode('FirmStep.jsx');
  for (const m of src.matchAll(/patch\(\{([^}]*)\}/g)) {
    if (!/firm_name/.test(m[1])) continue;
    assert.match(m[1], /UNLISTED_FIRM_ID|'other'|typed|name\b/,
      `firm_name is patched outside the unlisted-firm branch: patch({${m[1]}})`);
  }
});

// ---- the prop path END TO END, through the calls the pages actually make ----
// The plan asks a human to walk this and confirm the resolved rules are 5/10/8/3. That
// is pure-function logic, so it is asserted here instead: the existing walk in
// new-account-flow.test.js hand-feeds `daily_dd_pct: 5`, which proves the guard
// sequence but proves nothing about what the CATALOG resolves to. These replicate the
// two patches ProductStep and PhaseStep issue, verbatim.

test('GFT offers only its verified product — no 1-Step, no Instant Funding', () => {
  // The unverified two carry drawdowns nobody checked against the firm. If they ever
  // reach the product grid, a trader's challenge is scored against invented rules.
  const ids = wizardProducts('gft').map((p) => p.id);
  assert.deepEqual(ids, ['2step'], `the wizard would offer ${ids.join(', ')}`);
});

test('GFT 2-Step 25K Phase 1 resolves to 5 / 10 / 8 and 3 trading days', () => {
  let d = patchDraft(emptyDraft(), { capital_kind: 'prop' });
  d = patchDraft(d, { firm_id: 'gft' });
  assert.equal(d.firm_name, 'GoatFundedTrader', 'the name is derived, not typed');

  // ProductStep.chooseSize's provisional patch, off the product's FIRST phase.
  const product = findProduct('gft', '2step');
  const first = product.phases[0];
  d = patchDraft(d, {
    product_id: '2step',
    start_balance: 25000,
    daily_dd_pct: first.dailyDdPct,
    max_dd_pct: first.maxDdPct,
    dd_type: findFirm('gft').ddType,
    min_trading_days: first.minTradingDays,
  });
  assert.equal(isStepComplete(d, 'product'), true, 'the provisional rules are what let this step complete');
  assert.equal(firstIncomplete(d), 'phase');

  // PhaseStep's single authoritative resolution.
  const fields = templateToFields('gft', '2step', d.start_balance, 'p1');
  assert.ok(fields, 'templateToFields refused a combination the pages can produce');
  d = patchDraft(d, { phase: 'p1', ...fields });

  assert.equal(d.daily_dd_pct, 5);
  assert.equal(d.max_dd_pct, 10);
  assert.equal(d.profit_target_pct, 8);
  assert.equal(d.min_trading_days, 3);
  assert.equal(d.account_type, 'eval', 'derived from the phase, never asked');
  assert.equal(d.payout_split_pct, null, 'an evaluation has a target, not a split');
  assert.equal(d.dd_type, 'static');
  assert.equal(suggestedLabel(d), 'GoatFundedTrader 2-Step 25K');
});

test('the funded phase swaps the target for a split, both ways', () => {
  const fields = templateToFields('gft', '2step', 25000, 'funded');
  assert.equal(fields.account_type, 'funded');
  assert.equal(fields.profit_target_pct, null, 'a funded account is not scored against a target');
  assert.equal(fields.payout_split_pct, 80);
});

test('a size the product does not sell is refused, not rounded', () => {
  // The wizard's product step can only emit a real size, but a revived draft can
  // carry a stale one — and an accepted 37000 writes a start_balance the firm never
  // sold, then scores every drawdown against it.
  assert.equal(templateToFields('gft', '2step', 37000, 'p1'), null);
});

test('the unlisted firm reaches a valid payload on typed rules alone', () => {
  // The whole point of the escape hatch: nothing is COALESCEd from
  // GoatFundedTrader's defaults, because the trader supplied every number.
  let d = patchDraft(emptyDraft(), { capital_kind: 'prop' });
  d = patchDraft(d, { firm_id: 'other' });
  assert.equal(d.firm_name, null, 'the catalog label is not a firm name');
  assert.equal(firstIncomplete(d), 'firm', 'an unlisted firm with no typed name is not an identity');

  d = patchDraft(d, { firm_name: 'FundedNext' });
  assert.equal(firstIncomplete(d), 'product');

  // ProductStep's custom submit.
  d = patchDraft(d, {
    product_id: 'custom', start_balance: 20000,
    daily_dd_pct: 4.5, max_dd_pct: 8.5, dd_type: 'trailing', min_trading_days: 0,
  });
  assert.equal(firstIncomplete(d), 'phase');

  // PhaseStep's custom submit.
  d = patchDraft(d, {
    phase: 'p1', account_type: 'eval', profit_target_pct: 9, payout_split_pct: null,
  });
  d = patchDraft(d, { label: 'FundedNext 20K', platform: 'mt5' });

  const payload = toProvisionPayload(d);
  assert.equal(payload.firm_name, 'FundedNext');
  assert.equal(payload.daily_dd_pct, 4.5, 'a half-percent drawdown survives — hence step="0.1"');
  assert.equal(payload.max_dd_pct, 8.5);
  assert.equal(payload.dd_type, 'trailing');
  assert.equal(payload.profit_target_pct, 9);
  assert.equal(payload.broker, null, 'a prop account carries no broker');
});

// ---- Task 9: the import step, and the only place gating happens -------------

test('the import step gates through autoSyncGate, not its own plan arithmetic', () => {
  const src = readCode('ImportStep.jsx');
  assert.match(src, /autoSyncGate\(/);
  assert.equal(/=== 'free'|!== 'free'|'premium'/.test(src), false,
    'a second copy of the plan rule here is how the UI and the server disagree');
});

test('the import step shows the reason and the upgrade route, not a bare disabled card', () => {
  // Spec §7.5. A greyed card with no sentence beside it reads as a bug in our app.
  const src = readCode('ImportStep.jsx');
  assert.match(src, /reason/);
  assert.match(src, /\/billing/, 'the refusal must offer the route that lifts it');
});

test('only Auto Sync is gated — Manual and File upload never are', () => {
  // Free users journal by hand and by CSV; that is the whole free tier. A gate that
  // caught all three cards would make the flow uncompletable for them.
  //
  // Asserted against the step's own METHODS table rather than by regexing for
  // `gate.allowed` near `'manual'`: the table is data, so this reads which methods
  // are gated instead of guessing from how the branch happens to be written.
  const src = readCode('ImportStep.jsx');
  const table = /const METHODS = \[([\s\S]*?)\n\];/.exec(src);
  assert.ok(table, 'ImportStep must declare its methods as a METHODS table');
  const entries = table[1].split(/\},\s*\{/);
  const gatedIds = [];
  for (const e of entries) {
    const id = /id:\s*'(\w+)'/.exec(e);
    if (id && /gated:\s*true/.test(e)) gatedIds.push(id[1]);
  }
  assert.deepEqual(gatedIds, ['auto_sync'],
    `these methods are gated: ${gatedIds.join(', ')} — only auto_sync may be`);
});

test('the import step offers only methods this platform supports', () => {
  // `other` and MT4 offer file and manual only. Offering auto_sync there submits a
  // payload platformSupports() refuses with a 400.
  const src = readCode('ImportStep.jsx');
  assert.match(src, /importMethods|findPlatformCard\(/);
});

test('the import step commits for the branches that end here, and only those', () => {
  // Spec §6.2: `import` is the commit point for Manual and File upload; Auto Sync and
  // the EA commit on `connect`. Committing for all four would create the account
  // before the credential was collected — the half-configured row this whole commit
  // strategy exists to avoid.
  const src = readCode('ImportStep.jsx');
  assert.match(src, /commit\(/);
  assert.match(src, /commitStep\(/, 'the branch decision must come from the tested function');
});

test('no step calls provisionAccount directly — the shell owns the commit', () => {
  // One call site means one place that records the account, reloads the list and
  // stamps onboarding. Two means one of them forgets.
  for (const f of stepFiles()) {
    assert.equal(/provisionAccount\(/.test(readCode(f)), false,
      `${f} provisions directly — use commit() from the flow context`);
  }
});

test('the EA is not a fourth card', () => {
  // Spec §2 decision 5 and §7.4: the EA is a sub-choice UNDER Auto Sync, decided on
  // connect. A card here would put two doors on one route and make `connect`
  // unreachable for the EA.
  const src = readCode('ImportStep.jsx');
  const table = /const METHODS = \[([\s\S]*?)\n\];/.exec(src);
  assert.equal(/id:\s*'ea'/.test(table[1]), false, 'the EA must not be an import card');
});

test('GATING IS CURRENTLY OFF, so every method is offered on every plan', () => {
  // Plan gating was lifted by owner decision 2026-08-25 (see THE POLICY PIN in
  // plans.test.js). autoSyncGate therefore allows every plan, so the disabled-with-a-
  // reason path this step exists for is unreachable today. The card, the reason and
  // the Billing link are kept wired rather than deleted, because they are what §7.5
  // needs the moment caps return — and the pin fails if caps come back without this.
  for (const plan of KNOWN_PLANS) {
    const g = autoSyncGate({ plan, accounts: Array.from({ length: 20 }, () => ({ kind: 'synced' })) });
    assert.equal(g.allowed, true, `${plan}: Auto Sync should be offered while gating is off`);
  }
});

test('no page uses an Alert variant that resolves to nothing', () => {
  // Alert ships info/success/warning. `warning` works — this app has a --warning token
  // (amber). `info` and `success` do not exist and are inert, deliberately: emerald as
  // status would be a green reading as profit, and blue as status collides with brand
  // blue, both forbidden by §4. Using either renders an unstyled box and no reviewer
  // catches it by eye. See primitives/alert.jsx.
  for (const f of appJsx()) {
    const src = readCode(f);
    const bad = [...src.matchAll(/<Alert\b[^>]*variant=(?:"|\{')(info|success)/g)];
    assert.deepEqual(bad.map((m) => m[1]), [],
      `${f} uses an Alert variant with no tokens behind it`);
  }
});

// ---- Task 10: the connect step ---------------------------------------------

test('the connect step asks HOW before it asks for anything secret', () => {
  // Spec §7.4: the sub-choice comes first. A page that renders a password field
  // before the user has chosen to give us one is asking for a broker credential by
  // default.
  const src = readCode('ConnectStep.jsx');
  assert.match(src, /'auto_sync'/);
  assert.match(src, /'ea'/);
});

test('the connect step keeps the password out of the draft entirely', () => {
  // Spec §6.1. Local state, straight into commit()'s `extra`. The draft is mirrored
  // to sessionStorage, which any script on the origin can read.
  const src = readCode('ConnectStep.jsx');
  assert.match(src, /useState/);
  for (const m of src.matchAll(/patch\(\{([^}]*)\}/g)) {
    assert.equal(/password/i.test(m[1]), false, `patch({${m[1]}}) carries a password`);
  }
  assert.match(src, /commit\(\s*\{\s*credential/,
    'the credential must go to commit() as extra, never through the draft');
});

test('the password never even reaches sessionStorage-adjacent state', () => {
  // Stronger than the patch() check: nothing may put the password anywhere but the
  // one useState and the one commit() call. A `console.log`, a URL or an analytics
  // call would all be a leak the patch() assertion cannot see.
  const src = readCode('ConnectStep.jsx');
  assert.equal(/sessionStorage|localStorage/.test(src), false,
    'the connect step must not touch web storage at all');
  assert.equal(/console\.\w+\([^)]*password/i.test(src), false, 'the password must not be logged');
});

test('the connect step names the read-only guarantee as a checked fact', () => {
  // The worker reads account_info().trade_allowed on every login and DELETES a
  // credential that can trade. That is a checked fact, not a promise, and the copy
  // must say the tradeable password is rejected — spec §7.6.
  const src = readCode('ConnectStep.jsx');
  assert.match(src, /investor/i);
  assert.match(src, /reject|delete/i);
});

test('the read-only copy stays MT5-specific, so P2 cannot inherit it', () => {
  // Spec §7.6 and §10 risk 1: TradeLocker has no investor-password concept, so this
  // promise becomes false the moment TradeLocker ships. It must be reachable only for
  // the platform that keeps it.
  const src = readCode('ConnectStep.jsx');
  assert.match(src, /'mt5'/,
    'the read-only note must be gated on the platform, not printed unconditionally');
});

test('the connect step pre-checks the login while the user types', () => {
  // Spec §6.3: a collision reported before the password is typed beats a 409 at the
  // end of a nine-step flow.
  const src = readCode('ConnectStep.jsx');
  assert.match(src, /checkLoginAvailable\(/);
  assert.match(src, /setTimeout|debounce/i, 'the pre-check fires on every keystroke without one');
});

test('a 409 keeps what the user typed', () => {
  // Spec §6.3. Clearing the form on a collision makes the user retype a server name
  // and a login to change one digit.
  const src = readCode('ConnectStep.jsx');
  const afterCatch = src.slice(src.indexOf('catch'));
  assert.equal(/setServer\(''\)|setLogin\(''\)|setPassword\(''\)/.test(afterCatch), false,
    'the catch path must not clear the typed values');
});

test('the EA branch reuses SetupCard rather than restating the three steps', () => {
  // Spec §7.4: "how do I attach the EA" keeps exactly one answer, whether it is asked
  // at creation or a month later from the accounts table.
  assert.match(readCode('ConnectStep.jsx'), /SetupCard/);
});

test('the server-run branch is hidden when the server cannot store a credential', () => {
  // OWNER DECISION 2026-08-25: rather than attempting the provision and reading the
  // 503, the step reads autoSyncConfigured off the login pre-check it already makes.
  // The 503 fires BEFORE validateCredential, so the alternative sends a broker
  // password to a server guaranteed to refuse it.
  const src = readCode('ConnectStep.jsx');
  assert.match(src, /autoSyncConfigured/);
  // `false` specifically, never falsy: `null` means the pre-check could not answer,
  // and hiding the branch on an unknown would strand a user whose network blipped.
  assert.match(src, /autoSyncConfigured === false/,
    'an unknown answer (null) must not hide the branch — only a definite false');
});

// ---- Task 11: upload and done ----------------------------------------------

test('the upload step drives the shared CSV flow rather than its own', () => {
  // Spec §8.3: extracted and shared, not copied. A second copy is how the two
  // surfaces come to disagree about what a duplicate count means.
  const src = readCode('UploadStep.jsx');
  assert.match(src, /csvImportFlow/);
  assert.match(src, /importReducer|csvSizeVerdict/);
});

test('the upload step checks the file size before uploading it', () => {
  // The CSV rides inside a JSON body at a 12 MB limit and escaping inflates it. A 413
  // after a long upload at the LAST step of a nine-step flow is the worst possible
  // place to discover it.
  assert.match(readCode('UploadStep.jsx'), /csvSizeVerdict\(/);
});

test('the upload step clears the previous preview BEFORE reading a new file', () => {
  // The same bug the modal shipped and had to be fixed for: during `await file.text()`
  // the component stays mounted, so a stale preview leaves the confirm button live and
  // a click imports the PREVIOUS csv. Asserted here too, because this is a second
  // surface driving the same reducer and the reducer cannot express ordering.
  const src = readCode('UploadStep.jsx');
  const readAt = /const \w+ = await file\.text\(\)/.exec(src);
  assert.ok(readAt, 'the upload step no longer reads the file into a local');
  assert.match(src.slice(0, readAt.index), /dispatch\(\{\s*type:\s*'file'[^}]*csv:\s*''/,
    'the clearing dispatch must precede the read');
});

test('the upload step imports into the account that was just created', () => {
  // Not into the god view. The account exists by now (the commit was at `import`), and
  // rows filed account-less would not show in the per-account view the user is about
  // to be dropped into.
  const src = readCode('UploadStep.jsx');
  assert.match(src, /draft\.account/);
  assert.match(src, /mt5_login/, 'importTrades scopes by mt5_login, not by the row id');
});

test('the upload step is skippable, and skipping records that it was', () => {
  // The account is already real, so skipping costs nothing — but the guard needs to
  // know, or a refresh sends the user back to a step they chose to leave.
  const src = readCode('UploadStep.jsx');
  assert.match(src, /uploadDone/);
});

test('done selects the new account before leaving', () => {
  // Spec §8.1: "Home page" must land on a dashboard already scoped to what was just
  // created, not on the god view.
  //
  // Asserted as "the primary action is WIRED to finish", not as the text `finish(`:
  // `onClick={finish}` passes the reference, which is ordinary React and contains no
  // call. Demanding the call would have forced a pointless arrow wrapper.
  assert.match(readCode('DoneStep.jsx'), /onClick=\{(?:\(\)\s*=>\s*)?finish/,
    'the primary action must call finish() — selecting the account is what scopes the dashboard');
});

test('done says something branch-specific, not one generic sentence', () => {
  // Four branches end here and what happens next differs in each: a queued first sync,
  // an EA waiting for its first trade, an imported statement, or an empty journal. One
  // sentence covering all four tells the user nothing about their own account.
  //
  // Read off the page's own NEXT table rather than grepping for quoted literals — the
  // table is data, and object keys are written bare.
  const src = readCode('DoneStep.jsx');
  const table = /const NEXT = \{([\s\S]*?)\n\};/.exec(src);
  assert.ok(table, 'DoneStep must map the branches in a NEXT table');
  const branches = [...table[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(branches.sort(), ['auto_sync', 'ea', 'file', 'manual'],
    `the table covers ${branches.join(', ')} — every branch that ends here needs its own line`);
});

test('done does not call completeOnboarding — the shell did that at the commit', () => {
  // Decision B9. A second call would be a redundant request whose failure has no
  // meaning, and the stamp has to survive a tab closed before this page.
  assert.equal(/completeOnboarding/.test(readCode('DoneStep.jsx')), false);
});

test('neither terminal step offers a way back', () => {
  // Spec §6.2. canVisit already refuses it and prevStep returns null, but a Back
  // control rendered here would be a visible dead control.
  for (const page of ['UploadStep.jsx', 'DoneStep.jsx']) {
    assert.equal(/back\(\)/.test(readCode(page)), false,
      `${page} renders a Back control after the account has been created`);
  }
});

// ---- Task 12: one creation UI (spec §2 decision 7, §8.2) --------------------

test('the duplicate account form is gone for good', () => {
  // srcExists, not a path check: a `!existsSync('features/auth/Onboarding.jsx')`
  // starts passing for the wrong reason the moment the tree is reorganised, because it
  // points at a location the file would never be re-created in.
  assert.equal(srcExists('Onboarding.jsx'), false,
    "Onboarding.jsx's own copy of the account form is the duplication this change removes");
});

test('first run renders the same wizard routes, plus a catch-all to welcome', () => {
  // Spec §8.2: ONE route table, one component. The old branch mounted
  // <Route path="*"> and swallowed every URL, which would fight per-step routing.
  assert.match(app, /wizardRoutes\(/, 'the route table must be declared once and reused');
  assert.equal((app.match(/wizardRoutes\(/g) || []).length, 3,
    'declared once, called once per branch (first-run and onboarded)');
  assert.match(app, /to="\/accounts\/new\/welcome"/);
  assert.equal(/from '\.\/features\/auth\/Onboarding\.jsx'/.test(app), false,
    'the Onboarding import must go with the file');
});

test('welcome exists only on first run', () => {
  // stepsFor already enforces it; this checks the page does not also render a second
  // escape for a returning user, who reaches the wizard from Settings and must not be
  // offered "skip onboarding".
  assert.match(readCode('WelcomeStep.jsx'), /firstRun/);
});

test('the first-run escape completes onboarding with no account', () => {
  // The current "Skip for now" survives as a FIRST-RUN-ONLY escape (spec §8.2).
  // Without it a new user with no trading account yet cannot reach the app at all.
  assert.match(readCode('WelcomeStep.jsx'), /completeOnboarding\(/);
});

test('every Add Account affordance in the app navigates to the wizard', () => {
  // Three surfaces used to open a dialog: Settings > Accounts (two buttons), Prop OS >
  // Challenges (two buttons), and the onboarding wizard's own form.
  for (const page of ['SettingsAccounts.jsx', 'PropChallenges.jsx']) {
    const src = readCode(page);
    assert.match(src, /\/accounts\/new\/capital/, `${page} does not route to the wizard`);
    assert.equal(/mode="add"|mode='add'/.test(src), false, `${page} still opens an add dialog`);
  }
});

test('the edit dialog can no longer add', () => {
  const forms = readCode('AccountForms.jsx');
  assert.match(forms, /export function AccountEditModal\(/);
  assert.equal(/AccountFormModal/.test(forms), false, 'the add-capable name must go with the branch');
  assert.equal(/mode\s*===\s*'edit'|mode\s*=\s*'add'/.test(forms), false,
    'there is one mode now, so there is no mode');
  assert.equal(/acct-kind/.test(forms), false, 'the kind radios were an add-time question only');
  assert.equal(/eaAllowed\(/.test(forms), false, 'the add-time plan gate went with the add branch');
  assert.equal(/createAccount\(/.test(forms), false, 'the create call went with it too');
});

test('the account label is still asked in exactly one place per surface', () => {
  // The point of the whole change: two copies of a drawdown field is how a rule means
  // one thing on first run and another afterwards. The wizard collects them now; the
  // edit dialog corrects them. Nothing collects them twice.
  const label = allSrcFiles()
    .filter((f) => /\.jsx$/.test(f))
    .filter((f) => /placeholder="[^"]*(?:Challenge #1|Account label)/.test(readSrc(f)));
  assert.equal(label.length <= 2, true, `the account-label input appears in ${label.length} files: ${label}`);
});
