import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEP_IDS, emptyDraft, firstIncomplete, isStepComplete, patchDraft, suggestedLabel,
  toProvisionPayload,
} from '../frontend/src/features/accounts/newAccountFlow.js';
import {
  findFirm, findProduct, templateToFields, wizardProducts,
} from '../frontend/src/features/prop/propFirms.js';
import { readCode, readSrc, allSrcFiles } from './helpers/src-files.js';

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
