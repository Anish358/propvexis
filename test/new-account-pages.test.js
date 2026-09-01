import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES, STEP_IDS, emptyDraft, firstIncomplete, isStepComplete, patchDraft,
  suggestedLabel, toProvisionPayload,
} from '../frontend/src/features/accounts/newAccountFlow.js';
import {
  ACCOUNT_SIZES, ACCOUNT_TYPES, UNLISTED_FIRM_ID, findFirm, findProduct, firmInitials,
  phasesFor, templateToFields, wizardFirms, wizardProducts,
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

// ---- the capital step's redesign (owner reference layout, 2026-08-25) --------

test('the capital step selects, then continues — a card no longer advances', () => {
  // Owner decision, reversing this step's original "choosing advances in one action".
  // The answer is not a preference, it is the BRANCH: prop adds two pages and puts the
  // account under a firm's drawdown rules, and it is only re-choosable until the commit.
  // So the card records the choice and a separate action leaves the step.
  const src = readCode('CapitalStep.jsx');
  const cardClick = src.match(/onClick=\{\(\)\s*=>\s*setChosen\([^)]*\)\}/);
  assert.ok(cardClick, 'the card must record the choice, not navigate');
  // The card's own handler cannot be what leaves the step.
  assert.equal(/onClick=\{\(\)\s*=>\s*\{[^}]*advance\(\)/.test(src), false,
    'a card that patches and advances in its own handler is the pattern this replaced');
  assert.match(src, /disabled=\{!chosen\}/,
    'and Continue must be unavailable until something is chosen');
});

test('the capital step resolves the next step from the PATCHED draft', () => {
  // The trap the memory calls out: ordering around state is invisible to a structural
  // check. `advance()` reads the draft captured at render, so a step that patches and
  // leaves in one handler asks the PRE-patch draft where to go — and on this step the
  // pre-patch draft has no capital_kind, so its next step is the live branch's
  // `account`. It navigated there and was bounced back to `firm` by the guard: the right
  // destination by way of a wrong one, which is why nothing caught it.
  const src = readCode('CapitalStep.jsx');
  assert.match(src, /advance\(patch\(/,
    'hand patch()\'s return value to advance() — the branch depends on it');

  // And the shell has to accept it.
  assert.match(shell, /const advance = useCallback\(\(draftOverride\)/,
    'the shell\'s advance must take the draft the caller just computed');
});

test('advance() cannot be fooled by an event object', () => {
  // `onClick={advance}` passes a MouseEvent as the override. stepsFor() reads whatever
  // it is handed, so an event resolves to the live branch, indexOf misses the current
  // step and the wizard navigates to `/accounts/new/null`. Both halves are asserted:
  // no call site does it, and the shell would survive it if one did.
  for (const f of stepFiles()) {
    assert.equal(/onClick=\{advance\}/.test(readCode(f)), false,
      `${f}: pass advance as () => advance(), or the click event becomes the draft`);
  }
  assert.match(shell, /draftOverride\?\.v === FLOW_VERSION/,
    'the shell must check the override is a draft — `v` is the one property only a draft has');
});

test('a chosen card is announced, not only drawn', () => {
  // `data-selected` is a styling hook and reads as nothing to a screen reader, so before
  // this a chosen card was indistinguishable from the one beside it — and on a
  // select-then-Continue step that is the entire state of the page.
  const wizard = readCode('wizard.jsx');
  assert.match(wizard, /aria-pressed=\{typeof selected === 'boolean' \? selected : undefined\}/,
    'ChoiceCard must expose its selected state as aria-pressed');
  // Only when the caller actually passes `selected`: a card that is a plain action has
  // no state to hold and must not claim to be a toggle.
  assert.equal(/aria-pressed=\{!!selected\}|aria-pressed=\{selected\}/.test(wizard), false,
    'a card with nothing to hold must not report aria-pressed="false"');
});

test('the wizard grids are grids, and the name they avoided is now free', () => {
  /* WHAT THIS GUARDED, AND WHY IT CHANGED ON 2026-08-28.
   *
   * legacy/app.css used to declare `.grid { display: table; ... }` for the Trade Log,
   * unlayered — and index.css's whole cascade argument was that unlayered rules beat
   * anything Tailwind emits. So a ChoiceCard grid written as the bare `grid` utility
   * rendered as a 1012px-wide TABLE: cards stacked in one column, each sized to its own
   * text, overflowing the step, no gutter because `gap` does nothing on a table. That
   * shipped. `[display:grid]` was the same declaration under a class name no legacy
   * selector could claim, and this test kept the editor's Tailwind plugin from helpfully
   * rewriting it back.
   *
   * THE COLLISION IS GONE AT THE SOURCE NOW. The redesign put legacy in `layer(legacy)`,
   * which would have INVERTED the old mitigation (the utility would win), so the table
   * was renamed to `.log-grid` — a name Tailwind will never emit. Nothing squats `grid`
   * any more, so both spellings are safe and `[display:grid]` is history rather than a
   * requirement.
   *
   * The last assertion is the tripwire that made this rewrite happen instead of a
   * cargo-cult: it fired the moment the rename landed. It now watches the rename. */
  const wizard = readSrc('components/primitives/wizard.jsx');
  assert.match(wizard, /\[display:grid\]|\bgrid\b/, 'the wizard grids must still be grids');

  const legacy = readSrc('styles/legacy/app.css');
  assert.doesNotMatch(legacy, /^\.grid(?![-\w])/m,
    'legacy CSS is squatting `grid` again — the wizard grids would render as tables');
  assert.match(legacy, /^\.log-grid\s*\{[^}]*display:\s*table/m,
    'the Trade Log table rule has moved — re-check the collision');
});

test('hovering a chosen card does not undo the choice', () => {
  // Third instance of the same silent-CSS failure this component keeps hitting. The
  // selected fill compiles to `.data-selected\:bg-muted:where([data-selected=true])`,
  // and `:where()` contributes NOTHING to specificity — so a plain `hover:bg-card`
  // (one class plus `:hover`) outranked it, and hovering the card you had just chosen
  // returned it to the unchosen fill. Scoping the hover means the two rules cannot both
  // match, so neither source order nor specificity decides it.
  const wizard = readCode('wizard.jsx');
  assert.match(wizard, /not-data-selected:hover:bg-card/,
    'the hover fill must exclude the selected card rather than race it');
  assert.equal(/'hover:border-ring hover:bg-card'/.test(wizard), false,
    'the unscoped hover fill is what overrode the selection');
});

test('the icon size is set ON the icon, because an ancestor utility loses', () => {
  // A finding about the generated Button, verified in the built stylesheet: its cva base
  // ends with `[&_svg:not([class*='size-'])]:size-4`, compiling to `svg:not([class*=size-])`
  // — one attribute selector MORE specific than the `[&_svg]:size-N svg` a wrapper emits.
  // So a size written on an ancestor loses in silence and the glyph renders at 16px.
  // Cloning with a `size-*` class is the mechanism that `:not()` guard exists for.
  const wizard = readCode('wizard.jsx');
  assert.match(wizard, /React\.cloneElement\(icon, \{ className: cn\('size-6'/,
    'the centred card must put the size on the icon element itself');
});

test('the way out is an icon with a name, not a bare glyph', () => {
  // Reference layout: an X in the top right rather than the word "Exit". An icon-only
  // control with no accessible name is a listed accessibility anti-pattern, and this one
  // leaves a flow with answers in it — so it says "Exit setup", not "Close".
  const wizard = readCode('wizard.jsx');
  assert.match(wizard, /export function WizardExit/);
  assert.match(wizard, /aria-label=\{label\}/, 'the icon button needs an accessible name');
  assert.match(wizard, /title=\{label\}/, 'and a mouse user needs the same answer on hover');
  assert.match(shell, /<WizardExit/, 'the shell must use it rather than hand-rolling one');
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

test('the merged page offers the suggested label rather than inventing one', () => {
  const src = readCode('AccountStep.jsx');
  assert.match(src, /suggestedLabel\(/);
  assert.equal(/firm_name\s*\+|`\$\{.*firm/.test(src), false,
    'the page must not compose its own label — suggestedLabel is tested, a template string is not');
});

test('the merged page stops suggesting a label the moment the user types', () => {
  // On the old separate `name` step the suggestion was seeded ONCE, because everything
  // it derived from was already answered on earlier pages. Here it is not: the size and
  // the account type are chosen on this same page, so the suggestion has to keep up
  // with them — and must stop dead as soon as the user edits the field, or choosing a
  // different size would silently discard their own text.
  const src = readCode('AccountStep.jsx');
  assert.match(src, /labelTouched/, 'the page must track that the label was edited');
  assert.match(src, /labelTouched \? label :/,
    'the suggestion may only be shown while the field is untouched');
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

// ---- the firm step's redesign (owner reference layout, 2026-08-25) ----------

test('the firm step lists rows, not cards', () => {
  // The label IS the whole answer on this step — someone looking for FTMO is looking for
  // the word FTMO — and the sentence the old cards carried under each firm said the same
  // thing three times. Rows put eight firms in the space four cards would take, which is
  // the whole point once the catalog grows past three.
  const src = readCode('FirmStep.jsx');
  assert.match(src, /<ChoiceRow/, 'the firm options are rows');
  assert.equal(/<ChoiceCard/.test(src), false, 'and no longer cards');
  assert.match(src, /layout="rows"/, 'the grid has to know too — the gutter and the column floor differ');
});

test('the firm step searches on the NAME, never the id', () => {
  // The ids are internal ('gft', 'ftmo'). Matching them would make a query find a row
  // whose visible text does not contain what was typed.
  const src = readCode('FirmStep.jsx');
  assert.match(src, /<WizardSearch/, 'the owner asked for the search field');
  assert.match(src, /f\.name\.toLowerCase\(\)\.includes\(q\)/,
    'the filter must read the name');
  assert.equal(/\bf\.id\b[^\n]*includes\(q\)/.test(src), false,
    'matching the id would find rows whose text does not contain the query');
});

test('a search that finds nothing still offers the way forward', () => {
  // Three firms and a free-text box: a miss is the COMMON case, not the edge one. A bare
  // "no results" would leave the user with a working answer on screen (enter the rules
  // yourself) and no way to know it.
  const src = readCode('FirmStep.jsx');
  const note = src.match(/<WizardNote>([\s\S]*?)<\/WizardNote>/);
  assert.ok(note, 'an empty result needs to say something');
  assert.match(note[1], /UNLISTED_FIRM_ID/,
    'and it must name the row that can still help, from the catalog rather than retyped');
});

test('the firm step selects, then continues', () => {
  const src = readCode('FirmStep.jsx');
  assert.match(src, /onClick=\{\(\) => setChosenId\(firm\.id\)\}/, 'a row records the choice');
  assert.equal(/onClick=\{\(\) => \{[^}]*advance\(/.test(src), false,
    'a row must not navigate — Continue does');
  // The unlisted firm needs its name before Continue is available, which is what
  // COMPLETE.firm enforces one step later. The page agrees rather than being optimistic.
  assert.match(src, /canContinue = Boolean\(chosenId\) && \(!unlisted \|\| typedName\.trim\(\) !== ''\)/);
});

test('the firm step patches the id and the typed name in ONE call', () => {
  const src = readCode('FirmStep.jsx');
  // patchDraft only preserves a typed firm_name when it arrives WITH the firm_id — a
  // firm_id change on its own clears the name by design. Two patches would store the name
  // and then wipe it.
  assert.match(src, /patch\(\{ firm_id: UNLISTED_FIRM_ID, firm_name: typedName\.trim\(\) \}\)/);

  // AND EVERY patch() ON THIS PAGE TAKES AN OBJECT LITERAL, because two older tests read
  // this file for `patch({`: 'the unlisted firm cannot advance without a typed name' and
  // 'no step patches firm_name for a CATALOG firm'. A `patch(cond ? {…} : {…})` reads as
  // perfectly fine and makes BOTH of them pass vacuously — which is what the first draft
  // of this redesign did.
  for (const m of src.matchAll(/\bpatch\(/g)) {
    assert.equal(src[m.index + m[0].length], '{',
      'patch() must be called with an object literal here, or the older pins go vacuous');
  }
});

test('the firm mark is a monogram, and the rule is testable', () => {
  // We carry no logo assets and inventing artwork for a real firm is not a thing to do in
  // a component. The geometry is the reference's; the content is initials.
  //
  // In propFirms.js rather than in the step, because it is a rule with three branches and
  // that module is JSX-free — so this can call it instead of grepping for it.
  assert.equal(firmInitials('GoatFundedTrader'), 'GF');
  assert.equal(firmInitials('FTMO'), 'FT');
  // Fewer than two capitals falls back to the first two characters, so a lower-cased firm
  // still gets a mark rather than an empty tile.
  assert.equal(firmInitials('funded next'), 'FU');
  assert.equal(firmInitials('The5ers'), 'TH');
  assert.equal(firmInitials(''), '');
  assert.equal(firmInitials(null), '');
  // Every firm the wizard offers gets a non-empty mark — an empty tile beside a name is
  // a rendering hole, not a design.
  for (const firm of wizardFirms()) {
    if (firm.id === UNLISTED_FIRM_ID) continue;   // the escape hatch draws a glyph
    assert.notEqual(firmInitials(firm.name), '', `${firm.name} has no mark`);
  }
});

test('the measure is a property of the step, and the firm step is narrow', () => {
  // At the default 42rem a two-column list of 40px marks and short labels is mostly empty
  // space between the mark and the next column. The reference draws its picker in about
  // 27rem and its card row in twice that, and the shell is the only place that knows
  // which step is rendering — the step itself is inside the body it would be sizing.
  assert.match(shell, /const BODY_SIZE = \{[^}]*firm: 'narrow'/);
  assert.match(shell, /size=\{BODY_SIZE\[step\]/);
  // The three measures live in a table rather than a ternary inside cn(), because
  // utility-collisions.test.js reads every literal inside a cn() call as a class the
  // library ships — `size === 'wide'` was indexed as a utility named `wide`, which legacy
  // CSS has a real rule for. Variant values in a table, classes inside cn().
  const wizard = readCode('wizard.jsx');
  assert.match(wizard, /const BODY_MEASURE = \{ wide: 'max-w-3xl', narrow: 'max-w-md', default: 'max-w-2xl' \}/);
  assert.match(wizard, /BODY_MEASURE\[size\] \|\| BODY_MEASURE\.default/);
});

test('the step heading keeps ONE h1, and the eyebrow is not a heading', () => {
  // The eyebrow labels the question below it. An <h2> above an <h1>, or a second <h1>,
  // inverts the outline a screen-reader user navigates by.
  const wizard = readCode('wizard.jsx');
  assert.equal((wizard.match(/<h1/g) || []).length, 1, 'exactly one h1 in the wizard');
  // Sliced between two exports, NOT matched with `[\s\S]*?\n}` — comment-stripped source
  // leaves the JSX comments behind as bare `{\n}` blocks, and the lazy match stopped at
  // the first one, three lines short of the element being asserted. Same class of trap as
  // the `await file.text()` anchor: pin on a form only code can produce.
  const from = wizard.indexOf('export function WizardHeading');
  const heading = wizard.slice(from, wizard.indexOf('export function', from + 1));
  assert.match(heading, /\{eyebrow \? \(\s*<p/, 'the eyebrow is a paragraph, not a heading');
  assert.match(heading, /<h1/, 'and the slice really does reach the heading it is about');
  // The section label IS a heading — it names a group of options under the question.
  assert.match(wizard, /export function WizardSectionTitle[\s\S]*?<h2/);
});

test('the account type is a FIXED list of four, not the firm catalog', () => {
  // WHAT THIS REPLACED, and what it costs. The type used to come from
  // `wizardProducts(firm_id)`, so GFT offered its verified 2-Step and nothing else and
  // the unverified 1-Step and Instant Funding rules could never reach a trader. Owner
  // decision 2026-08-25: four types, offered for every firm. That is only safe BECAUSE
  // the presets are gone — nothing is resolved from the catalog any more, so an
  // unverified drawdown cannot be prefilled from one. If presets ever come back, this
  // pairing has to be revisited together.
  const src = readCode('AccountStep.jsx');
  assert.match(src, /ACCOUNT_TYPES/, 'the four types come from the shared table');
  assert.equal(/wizardProducts\(/.test(src), false, 'the catalog no longer decides the type');
  assert.equal(/\.products\b/.test(src), false, 'and it must not read firm.products either');
  assert.deepEqual(ACCOUNT_TYPES.map((t) => t.id), ['1step', '2step', '3step', 'instant']);
});

test('NO PRESETS: the page resolves nothing from the catalog', () => {
  // OWNER DECISION 2026-08-25 (second pass) — presets are removed and will return
  // later. This is the inverse of the assertion that stood here, and it is inverted
  // rather than deleted so the removal stays deliberate: a reader who reintroduces a
  // prefill will fail this test and go looking for why.
  //
  // WHAT IT COSTS, recorded because it is invisible: a GoatFundedTrader 2-Step trader
  // now types 5 / 10 / 8 / 3 by hand and nothing checks it against the catalog we
  // already have. A mistyped drawdown does not fail loudly — it mis-scores that account
  // for the length of the challenge.
  const src = readCode('AccountStep.jsx');
  assert.equal(/templateToFields/.test(src), false, 'no rule may be resolved from the catalog');
  assert.equal(/useEffect/.test(src), false, 'the prefill effect is what was removed');
  assert.equal(/rulesTouched/.test(src), false, 'and the guard that existed only to protect it');
});

test('templateToFields survives untouched, for when presets return', () => {
  // It is called from no page now. It stays exported and tested because it is the only
  // thing that enforces size membership and the eval-vs-funded target/split split, so
  // presets should come back THROUGH it rather than by reading phase objects in a page.
  assert.ok(templateToFields('gft', '2step', 25000, 'p1'), 'still resolves a real combination');
  assert.equal(templateToFields('gft', '2step', 37000, 'p1'), null, 'still refuses a size not sold');
});

test('the account size is the owner list plus a free field', () => {
  // The eight cover what firms usually sell; they also sell 8K, 12.5K and 1M. The free
  // field is not a fallback for an empty list — it is the answer to "more or custom", so
  // it stays reachable when one of the eight is right.
  assert.deepEqual(ACCOUNT_SIZES, [5000, 10000, 15000, 25000, 50000, 100000, 200000, 300000]);
  const src = readCode('AccountStep.jsx');
  assert.match(src, /ACCOUNT_SIZES\.map/, 'one option per size');
  assert.match(src, /CUSTOM_SIZE/, 'and a row for anything else');
  // A SENTINEL, not "a size that is not in the list": without it the page cannot tell
  // "typing 8000" from "nothing chosen yet", because both are a value the list lacks.
  assert.match(src, /sizeChoice === CUSTOM_SIZE \? customSize : sizeChoice/);
  assert.equal(/firmSizes/.test(src), false, 'the sizes no longer come from the firm');
});

test('the account name has to be unique among the accounts the user has', () => {
  // The owner's spec. Compared trimmed and case-insensitively, because "FTMO 25K" and
  // "ftmo 25k " are two rows nobody can tell apart in an account switcher.
  const src = readCode('AccountStep.jsx');
  assert.match(src, /takenNames/);
  assert.match(src, /\.trim\(\)\.toLowerCase\(\)/);
  assert.match(src, /duplicateName/, 'and it must block Continue, not just warn');
  assert.match(src, /ready = [\s\S]*?!duplicateName/);
  // It is compared against the accounts the user ALREADY has, which only the shell can
  // supply — the draft knows nothing about them. CLIENT-SIDE ONLY, and the page says so:
  // neither the database nor validateProvision enforces label uniqueness, so a second tab
  // can still create a duplicate. Not asserted as the absence of a server check, because
  // adding one would be an improvement and a test that fails on an improvement is a trap.
  assert.match(src, /const \{ draft, patch, advance, accounts(?:, \w+)* \} = useFlow\(\)/);
  assert.match(src, /\(accounts \|\| \[\]\)\.map/, 'read from the account list, defensively');
});

test('the duplicate-name error is visible, in the colour the app uses for errors', () => {
  // IT RENDERED NOTHING BEFORE. `Field.Error` shows itself from the control's native
  // ValidityState, and "you already have an account with this name" is not in it — so the
  // element sat in the tree, compiled, and invisible. `match` is Base UI's own prop for
  // "the caller has decided"; the page renders the element only when there IS an error.
  //
  // AND IT WAS WHITE. `text-destructive-foreground` maps to `--on-accent`, a near-white
  // for text sitting ON a destructive fill; on the page background it reads as ordinary
  // copy. `text-destructive` is what legacy `.error` and `Alert variant="error"` already
  // resolve to — the wizard shows one of those two steps later, so a white validation
  // message beside a red alert was a bug, not a position on §17.
  const field = readCode('components/primitives/field.jsx');
  assert.match(field, /<UIFieldError\n(?:.*\n)*?\s+match\n/, 'the error must render when the caller says so');
  assert.match(field, /cn\('text-destructive'/);
  assert.equal(/text-destructive-foreground/.test(field), false, 'that is the on-fill colour');
});

test('page 3 lays its controls out in the owner\'s sketch', () => {
  // Type · Size, then Phase · Name, then an "Account Details" label over the four rule
  // fields and the drawdown toggle. TWO field grids with the section title between them,
  // which is what makes the label belong to the fields under it rather than floating
  // between two rows of one grid.
  const src = readCode('AccountStep.jsx');
  assert.equal((src.match(/<WizardFields>/g) || []).length, 2, 'two field grids');
  assert.match(src, /<WizardSectionTitle>Account Details<\/WizardSectionTitle>/);
  // The order of the fields IS the sketch, and that can only be checked as a sequence.
  // `Account Name` comes first because it is defined above the JSX as `nameField` — the
  // live path renders it alone.
  const labels = [...src.matchAll(/<FieldLabel[^>]*>([^<]+)<\/FieldLabel>/g)].map((m) => m[1].trim());
  assert.deepEqual(labels, [
    'Account Name',
    'Account Type', 'Account Size', 'Select Phase',
    'Daily Drawdown (%)', 'Max Drawdown (%)', 'Payout Split (%)', 'Profit Target (%)',
    'Minimum Trading Days', 'Drawdown Type',
  ]);
  // And the body is `wide`, because two columns of fields need room for two labels and
  // two values.
  assert.match(readCode('NewAccountFlow.jsx'), /const BODY_SIZE = \{[^}]*account: 'wide'/);
});

test('the controls are dropdowns and a toggle, per the owner\'s spec', () => {
  // The four type cards and three phase cards used ten times the height of a select for
  // the same one-of-N answer, on a page that asks nine questions — the grids pushed the
  // drawdowns below the fold, which is where a rule nobody reads gets typed wrong.
  const src = readCode('AccountStep.jsx');
  assert.equal((src.match(/<Select\b/g) || []).length, 3, 'type, size and phase are dropdowns');
  assert.match(src, /<ToggleGroupExclusive/, 'drawdown type is a toggle');
  /* THE RULE IS ABOUT THE ONE-OF-N FIELDS, and it is now stated that way. It used to be
   * "no ChoiceCard anywhere on this page", which was the same thing while the page had
   * nothing but fields. The existing-challenge list (0027) is a card grid on purpose —
   * a challenge is identified by a name, a state line and the phase it is waiting for,
   * which is three lines of content, not a one-of-N value a dropdown row could hold.
   * What must not come back is a card grid for the TYPE or the PHASE. */
  // Anchored on the PROP form's own opening tag (`stretch`), not on the first
  // `<WizardForm` in the file — that one is the live path's single-field form, and a
  // slice from there covers the whole page including the challenge list above it.
  const fields = src.slice(src.indexOf('<WizardForm onSubmit={onSubmit} stretch>'));
  assert.ok(fields.includes('<WizardSectionTitle>'), 'the slice must really reach the fields');
  assert.equal(/<ChoiceCard/.test(fields), false, 'no card grid among the fields');
  assert.equal(/<ChoiceGrid/.test(fields), false, 'and no choice grid either');
  // The closed trigger has to show the LABEL. Base UI renders the raw value unless the
  // Root is told the labels, so without these the field reads "2step" and "25000" after
  // being chosen — built from the same tables the options are.
  assert.match(src, /items=\{TYPE_LABELS\}/);
  assert.match(src, /items=\{SIZE_LABELS\}/);
  assert.match(src, /items=\{PHASE_LABEL\}/);
});

test('no question page explains itself under the title', () => {
  // Owner decision 2026-08-25: the explanation text comes out, on this page and the rest.
  // Asserted as a RULE rather than page by page, so it cannot creep back one step at a
  // time. Welcome and Done keep theirs: neither asks a question — one is an intro whose
  // description introduces the three pillars under it, the other is a receipt naming
  // what happened.
  const allowed = new Set(['WelcomeStep.jsx', 'DoneStep.jsx']);
  for (const f of stepFiles()) {
    const name = f.split('/').pop();
    if (allowed.has(name)) continue;
    for (const h of readCode(f).match(/<WizardHeading[\s\S]*?\/>/g) || []) {
      assert.equal(/description=/.test(h), false, `${name} still explains itself: ${h}`);
    }
  }
});

test('no step labels itself "Add Account" above the question', () => {
  // Owner decision 2026-08-27: the eyebrow comes off every step. It answered "where am
  // I" in a page with no sidebar and no breadcrumb — but it answered it seven times, once
  // per step, with the same two words, above the only line on the page that changes.
  //
  // Asserted as a RULE across the step files, exactly like the description sweep above,
  // so it cannot come back one page at a time. The PROP stays on WizardHeading: it is a
  // primitive capability with its own outline test (an eyebrow is a <p>, never an <h2>),
  // and what the owner decided is that no step of THIS flow passes it.
  for (const f of stepFiles()) {
    const src = readCode(f);
    assert.equal(/eyebrow=/.test(src), false, `${f.split('/').pop()} still labels itself`);
  }
});

test('every rule is collected from the user, for every firm', () => {
  // With presets gone this is no longer a special case for the unlisted firm — the page
  // asks for all of them from everyone, which is what "remove the presets" means. The
  // reason the list matters is unchanged: a missing percentage is numOrNull'd by
  // validateProvision and then COALESCEd by mt5_accounts to 5/10/8, so an unasked
  // drawdown becomes GoatFundedTrader's silently.
  const src = readCode('AccountStep.jsx');
  for (const field of ['daily_dd_pct', 'max_dd_pct', 'start_balance', 'min_trading_days']) {
    assert.ok(src.includes(field), `the page does not collect ${field}`);
  }
  assert.match(src, /payout_split_pct/);
  assert.match(src, /profit_target_pct/);
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

test('the phase list is DERIVED from the account type', () => {
  // The owner's rule, and the reason it is a rule: an Instant account is funded from the
  // start, so offering it "Phase 2" would let a trader file a challenge that cannot
  // exist — and the phase decides which number the account is scored against (a target
  // for an evaluation, a split for a funded account).
  assert.deepEqual(phasesFor('1step'), ['p1', 'funded']);
  assert.deepEqual(phasesFor('2step'), ['p1', 'p2', 'funded']);
  assert.deepEqual(phasesFor('3step'), ['p1', 'p2', 'p3', 'funded']);
  assert.deepEqual(phasesFor('instant'), ['funded']);
  // An unrecognised type offers NOTHING rather than everything — including the 'custom'
  // product older accounts carry, which the picker deliberately does not offer.
  assert.deepEqual(phasesFor('custom'), []);
  assert.deepEqual(phasesFor(undefined), []);

  // Every phase any type offers must be one the server accepts, or the flow ends in a
  // 400 nine questions later.
  for (const t of ACCOUNT_TYPES) {
    for (const phase of t.phases) {
      assert.ok(PHASES.includes(phase), `${t.id} offers ${phase}, which provision.js rejects`);
    }
  }

  const src = readCode('AccountStep.jsx');
  // `effProductId` — the type the challenge dictates while joining one, else the type the
  // trader picked. ONE value feeds the phase list, the validation and the submitted
  // patch, so a locked field cannot be validated against one type and submitted with
  // another.
  assert.match(src, /phasesFor\(effProductId\)/, 'the page must derive the list, not restate it');
  assert.match(src, /const effProductId = inherited\.product_id \?\? productId/);
  // Changing the type has to withdraw a phase that type does not have, or picking Instant
  // after Phase 2 leaves a phase selected that the dropdown no longer offers.
  assert.match(src, /setPhase\(\(p\) => \(phasesFor\(nextId\)\.includes\(p\) \? p : ''\)\)/);
});

test('the merged page never writes account_type itself', () => {
  // Stronger than the old assertion, and it has to be: this page sets the phase AND
  // reads account_type back to decide which number to ask for. patchDraft derives it,
  // so the page patching its own would be a second writer for one fact — and the
  // failure is a funded challenge filed as an evaluation, scored against a target it
  // does not have.
  const src = readCode('AccountStep.jsx');
  assert.equal(/<select[^>]*account_type|name="account_type"/.test(src), false,
    'account_type must not be a control — the phase decides it');
  for (const m of src.matchAll(/patch\(\{([\s\S]*?)\}\)/g)) {
    assert.equal(/account_type/.test(m[1]), false, 'the page must not patch account_type');
  }
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
  // Still incomplete: the merged page also wants the phase and the label, so partial
  // rules are not an answer.
  assert.equal(firstIncomplete(d), 'account');

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
  assert.equal(firstIncomplete(d), 'account');

  // ProductStep's custom submit.
  d = patchDraft(d, {
    product_id: 'custom', start_balance: 20000,
    daily_dd_pct: 4.5, max_dd_pct: 8.5, dd_type: 'trailing', min_trading_days: 0,
  });
  // Still `account`: the merged page also wants the phase, its number and the label.
  assert.equal(firstIncomplete(d), 'account');

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

test('only the synced methods are gated — Manual and File upload never are', () => {
  // Free users journal by hand and by CSV; that is the whole free tier. A gate that
  // caught all four cards would make the flow uncompletable for them.
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
  // The EA joined Auto Sync when it became a card: an EA account is kind 'synced' and
  // occupies a synced slot exactly as a hosted one does, so the same cap applies. What
  // must never be gated is the pair that IS the free tier.
  assert.deepEqual(gatedIds.sort(), ['auto_sync', 'ea'],
    `these methods are gated: ${gatedIds.join(', ')} — only the synced ones may be`);
  for (const free of ['manual', 'file']) {
    assert.equal(gatedIds.includes(free), false, `${free} must never be gated`);
  }
});

test('an import method is a name and an icon — the blurbs are gone', () => {
  // Owner decision 2026-08-27, the same pass that took the eyebrow off every step. The
  // four blurbs each explained the PLUMBING behind a method (what installs, what is
  // stored, what stays running); the answer the trader is giving is which of the four
  // they want. The cards became the centred icon cards the capital step already uses.
  //
  // Read off the METHODS table rather than from the JSX, for the same reason the gating
  // test is: the table is data, so this asserts what the cards ARE instead of guessing
  // from how the map happens to be written.
  const src = readCode('ImportStep.jsx');
  const table = /const METHODS = \[([\s\S]*?)\n\];/.exec(src);
  assert.ok(table, 'ImportStep must declare its methods as a METHODS table');
  for (const e of table[1].split(/\},\s*\{/)) {
    const id = /id:\s*'(\w+)'/.exec(e)?.[1] ?? '?';
    assert.equal(/description:/.test(e), false, `${id} still carries a blurb`);
    assert.match(e, /icon:\s*[A-Z]\w+/, `${id} has no icon, so its card would be a bare name`);
  }
  // Centred with the icon in its own tile — the capital step's layout, so the flow's two
  // card steps read as one control rather than two.
  assert.match(src, /align="center"/);

  // THE GATE'S REASON IS THE EXCEPTION AND MUST SURVIVE. §7.5: a disabled card whose
  // reason is invisible reads as a bug in our app, and with the blurbs gone
  // `description` is the only place that sentence can go — passed only when blocked.
  assert.match(src, /description=\{blocked \? gate\.reason : undefined\}/,
    'the blocked card must still say why, and an unblocked one must say nothing');
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

test('the EA IS a fourth card, and connect no longer asks how', () => {
  // THIS ASSERTION IS INVERTED FROM WHAT IT WAS, deliberately. Spec §2 decision 5 and
  // §7.4 made the EA a sub-choice under Auto Sync; the owner reversed that on
  // 2026-08-25, because the two are not one answer to the trader — one needs a broker
  // password and the other needs a file on their PC, and burying that behind a card
  // they have already clicked hides the choice that costs them something.
  const src = readCode('ImportStep.jsx');
  const table = /const METHODS = \[([\s\S]*?)\n\];/.exec(src);
  assert.match(table[1], /id:\s*'ea'/, 'the EA must be an import card');
  // The four the flow admits, and no fifth.
  const ids = [...table[1].matchAll(/id:\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), ['auto_sync', 'ea', 'file', 'manual']);
  // ...and the sub-choice is GONE from connect, not merely duplicated onto import.
  const connect = readCode('ConnectStep.jsx');
  assert.equal(/setMode\(|mode === 'ea'|mode === 'auto_sync'/.test(connect), false,
    'connect must not still offer the how-do-we-connect choice');
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

test('the connect step is reached only after the user chose to give a credential', () => {
  // The old form of this asserted the sub-choice came before the password field. The
  // choice moved to `import`, so what protects the same property now is that this page
  // branches on the ALREADY-MADE decision rather than asking again: the EA branch shows
  // a setup card and never renders a password field at all.
  const src = readCode('ConnectStep.jsx');
  assert.match(src, /draft\.import_method === 'ea'/, 'the branch must read the decision, not re-ask it');
  // Sliced to the SECOND branch's return, found by its heading title. Anchored on the
  // title alone rather than on the surrounding JSX shape: the headings lost their
  // `description` prop when the explanation text came out, and an anchor that spelled out
  // the element's line breaks stopped matching — sending the slice to -1 and asserting
  // against an empty string, which passes for the wrong reason.
  const ea = src.slice(src.indexOf('if (isEa)'), src.indexOf('title="Connect your account"'));
  assert.equal(/type="password"/.test(ea), false, 'the EA branch must render no password field');
});

test('nothing in the credential form is prefilled, including by the browser', () => {
  // Every field starts empty in our code, but Chrome and Safari ignore
  // `autoComplete="off"` on anything they read as a login/password pair and offer
  // whatever is saved for the origin — which is how a broker credential from a
  // DIFFERENT account appeared prefilled. `new-password` is the value they honour.
  const src = readCode('ConnectStep.jsx');
  assert.match(src, /autoComplete="new-password"/,
    'the password field must suppress autofill with new-password, not off');
  for (const f of ['server', 'login', 'password']) {
    assert.match(src, new RegExp(`const \\[${f}, set\\w+\\] = useState\\(''\\)`),
      `${f} must start empty — nothing may seed it from the draft`);
  }
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

// ---- Task 13: accessibility, and the stylesheet -----------------------------

test('every step is announced — the page changes without a page load', () => {
  // design-b-a11y.test.js establishes ONE polite live region for the app, and it lives
  // in Layout — which the wizard is a SIBLING of, so the wizard does not get it. A
  // wizard swaps its content under a fixed header, so without moved focus a
  // screen-reader user is left wherever they were with no signal that the question
  // changed; a URL change announces nothing by itself.
  //
  // Focus management rather than a second live region: moving focus to the step
  // container both announces the new heading AND repositions the reader's cursor, so
  // the next Tab lands in the new step rather than back in the old one.
  const shell = readCode('NewAccountFlow.jsx');
  assert.match(shell, /\.focus\(\)/, 'the shell must move focus when the step changes');
  assert.match(shell, /\[step\]|\[\s*step\s*\]/,
    'and it must do it ON the step change, not once on mount');

  // The target has to be able to receive focus, and the heading has to be a real h1 —
  // both live in the primitive, because that is where the markup is.
  const wizard = readCode('wizard.jsx');
  assert.match(wizard, /tabIndex=\{-1\}/, 'the step container must be programmatically focusable');
  assert.match(wizard, /<h1/, 'the step question must be the page heading');
});

test('the progress indicator is readable, not just visible', () => {
  // A bar with no text is silent. Asserted in wizard.jsx rather than the shell: the
  // shell passes index/total, the primitive renders them, and the accessible name
  // belongs with the markup.
  const wizard = readCode('wizard.jsx');
  assert.match(wizard, /aria-label=\{`Step \$\{/, 'the bar needs an accessible name naming the position');
  assert.match(wizard, /\{safeIndex\} of \{safeTotal\}/, 'and the count is visible text too');
});

// The plan's last two assertions here fenced a `.naf-*` block in legacy/app.css and
// checked it for raw hex. There is no such block: DESIGN-LANGUAGE §1 superseded that
// approach and this feature added ZERO lines to that stylesheet (held by its own test
// above). The INVARIANTS both were protecting still matter, so they are asserted where
// the styling actually lives.

test('the wizard writes no raw colour, anywhere in its components', () => {
  // §4, verbatim: "No raw colour anywhere. Components reference tokens; tokens.css is
  // the rebrand surface. A hex literal in a component is a bug." Arbitrary Tailwind
  // values are the same bug in a different costume — `bg-[#0af]` and `text-[rgb(...)]`
  // bypass the token layer exactly as a hex literal in CSS would.
  const files = [...stepFiles(), 'features/accounts/NewAccountFlow.jsx',
    'components/primitives/wizard.jsx'];
  for (const f of files) {
    const src = readCode(f);
    assert.deepEqual(src.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], `${f} carries a hex literal`);
    assert.deepEqual(src.match(/\b(?:bg|text|border|ring|fill|stroke)-\[(?:#|rgb|hsl|oklch)[^\]]*\]/g) || [], [],
      `${f} uses an arbitrary colour value, which bypasses the token layer`);
  }
});

test('the wizard adds no selector to any shared namespace', () => {
  // The convention every module in legacy/app.css follows (prop-challenges.test.js
  // asserts the same for `pc-`): a rule outside your namespace either duplicates a
  // shared system or leaks into one. The wizard's version of that is stronger — it owns
  // no namespace at all, because it writes no CSS. What it must not do is reach into
  // someone else's, which is the shape a "just this one class" fix would take.
  const files = [...stepFiles(), 'features/accounts/NewAccountFlow.jsx'];
  for (const f of files) {
    for (const m of readCode(f).matchAll(/className="([^"]*)"/g)) {
      assert.equal(m[1].trim(), '',
        `${f} sets className="${m[1]}" — a page cannot style itself here, so this either emits nothing or borrows another module's rule`);
    }
  }
});

test("the sweep, as a test: no stub marker and no removed export survive in CODE", () => {
  // The plan ran these as one-off shell greps. They are worth keeping, because the
  // failure they catch is silent: a route still rendering the stub would ship the word
  // "Phase — not built yet (TASK 7)" to a user, and nothing else would complain.
  //
  // Comment-stripped, and that is not incidental. Run as raw greps these produce false
  // positives on the prose that EXPLAINS the removals — WelcomeStep says its markup
  // replaced the `.onb-*` rules, and PropChallenges says its button used to open
  // AccountFormModal. Both sentences are worth keeping and neither is a reference.
  const jsx = allSrcFiles().filter((f) => /\.jsx?$/.test(f));
  for (const [what, re] of [
    ['a TASK stub marker', /TASK \d/],
    ['the removed AccountFormModal export', /AccountFormModal/],
    ['an orphaned .onb-* class', /onb-/],
  ]) {
    const hits = jsx.filter((f) => re.test(readCode(f)));
    assert.deepEqual(hits, [], `${what} survives in: ${hits.join(', ')}`);
  }
});

// ---- all four branches, as far as pure functions can carry them -------------
// The plan's last step walks each branch against a real database. The half that does
// not need one is the PAYLOAD: toProvisionPayload is pure, and it is what decides every
// column the walk then inspects. So the shapes are asserted here and the walk is left
// to confirm what the server does with them.

const walk0 = (from, patches) => patches.reduce((d, p) => patchDraft(d, p), from);
const walk = (patches) => walk0(emptyDraft(), patches);

test('branch 1 — Live Capital + Manual carries no prop rule at all', () => {
  const d = walk([
    { capital_kind: 'live' },
    { label: 'IC Markets Live' },
    { platform: 'mt5', broker: 'IC Markets' },
    { import_method: 'manual' },
  ]);
  assert.equal(firstIncomplete(d), 'import', 'manual commits AT import, so it is the first incomplete step');
  const p = toProvisionPayload(d);
  assert.equal(p.capital_kind, 'live');
  assert.equal(p.import_method, 'manual');
  assert.equal(p.broker, 'IC Markets', 'the broker is live-path only, and this is the live path');
  // validateProvision REJECTS a live payload naming a firm, product or phase — silently
  // dropping them would create an account the user believes tracks firm rules.
  for (const f of ['firm_id', 'firm_name', 'product_id', 'phase']) {
    assert.equal(p[f], null, `a live account must carry no ${f}`);
  }
});

test('branch 2 — Prop GFT 2-Step 25K Phase 1 + File carries the catalog rules', () => {
  const first = findProduct('gft', '2step').phases[0];
  let d = walk([
    { capital_kind: 'prop' },
    { firm_id: 'gft' },
    { challenge_mode: 'new' },
    {
      product_id: '2step', start_balance: 25000,
      daily_dd_pct: first.dailyDdPct, max_dd_pct: first.maxDdPct,
      dd_type: findFirm('gft').ddType, min_trading_days: first.minTradingDays,
    },
  ]);
  d = patchDraft(d, { phase: 'p1', ...templateToFields('gft', '2step', 25000, 'p1') });
  d = walk0(d, [{ label: 'GFT 2-Step 25K' }, { platform: 'mt5' }, { import_method: 'file' }]);
  const p = toProvisionPayload(d);
  assert.equal(p.capital_kind, 'prop');
  assert.equal(p.product_id, '2step');
  assert.equal(p.import_method, 'file');
  assert.deepEqual(
    [p.daily_dd_pct, p.max_dd_pct, p.profit_target_pct, p.min_trading_days],
    [5, 10, 8, 3],
  );
  assert.equal(p.broker, null, 'a prop account carries no broker even if one was typed');
});

test('branch 3 — Prop unlisted firm keeps the TYPED rules, not GFT defaults', () => {
  // The failure this guards is invisible: a missing percentage is numOrNull'd by the
  // validator and then COALESCEd by mt5_accounts to 5/10/8, so an unlisted firm's
  // account would be judged against GoatFundedTrader's rules with nothing to show it.
  const d = walk([
    { capital_kind: 'prop' },
    { firm_id: 'other' },
    { challenge_mode: 'new' },
    { firm_name: 'FundedNext' },
    {
      product_id: 'custom', start_balance: 20000,
      daily_dd_pct: 4.5, max_dd_pct: 8.5, dd_type: 'trailing', min_trading_days: 2,
    },
    { phase: 'p1', account_type: 'eval', profit_target_pct: 9, payout_split_pct: null },
    { label: 'FundedNext 20K' },
    { platform: 'mt5' },
    { import_method: 'manual' },
  ]);
  const p = toProvisionPayload(d);
  assert.equal(p.firm_id, 'other');
  assert.equal(p.firm_name, 'FundedNext');
  assert.equal(p.product_id, 'custom');
  assert.deepEqual([p.daily_dd_pct, p.max_dd_pct, p.profit_target_pct], [4.5, 8.5, 9]);
  assert.equal(p.dd_type, 'trailing');
  assert.notEqual(p.daily_dd_pct, 5, 'the GFT default must not have leaked in');
});

test('branch 4 — Prop + Auto Sync asks for the login and never the password', () => {
  const first = findProduct('gft', '2step').phases[0];
  let d = walk([
    { capital_kind: 'prop' },
    { firm_id: 'gft' },
    // A challenge of its own — the account page's first question since 0027. The
    // existing-challenge branch is walked in the same file, further down.
    { challenge_mode: 'new' },
    {
      product_id: '2step', start_balance: 50000,
      daily_dd_pct: first.dailyDdPct, max_dd_pct: first.maxDdPct,
      dd_type: findFirm('gft').ddType, min_trading_days: first.minTradingDays,
    },
  ]);
  d = patchDraft(d, { phase: 'funded', ...templateToFields('gft', '2step', 50000, 'funded') });
  d = walk0(d, [{ label: 'GFT Funded 50K' }, { platform: 'mt5' }, { import_method: 'auto_sync' }]);
  assert.equal(firstIncomplete(d), 'connect', 'auto_sync commits at connect, not at import');
  const p = toProvisionPayload(d);
  assert.equal(p.import_method, 'auto_sync');
  assert.equal(p.account_type, 'funded');
  assert.equal(p.payout_split_pct, 80, 'a funded account is scored on its split');
  assert.equal(p.profit_target_pct, null);
  // The credential is NOT in the payload at all — the connect step adds it at call
  // time, so it never enters the draft and never reaches sessionStorage (spec §6.1).
  assert.equal('credential' in p, false, 'the payload must never carry a credential');
  assert.equal('password' in p, false);
});

test('the shell discards a spent draft rather than resuming it', () => {
  // The pure predicate is only worth having if the shell asks it. This is the wiring:
  // the step has to be derived BEFORE the draft is hydrated (whether a stored draft may
  // be resumed depends on where it is being resumed), and the stored copy has to be
  // dropped, not just ignored — otherwise it is revived again on the next mount.
  const shell = readCode('NewAccountFlow.jsx');
  assert.match(shell, /isSpentDraft\(stored, step\)/, 'the shell must ask the predicate');
  assert.match(shell, /clearStoredDraft\(\)/, 'and drop the stored copy');
  assert.match(shell, /emptyDraft\(/, 'and start from a fresh draft, which mints a new provision_key');
  // Order matters: `step` must be assigned above the useState that reads it, or it is
  // undefined at hydration and every committed draft looks spent — including a refresh
  // on `done`.
  assert.ok(shell.indexOf('const step =') < shell.indexOf('const [draft, setDraft]'),
    'the step must be derived before the draft is hydrated');
});

test('finish drops the draft on the way out', () => {
  // So a browser Back to /accounts/new/done finds nothing to revive rather than
  // re-rendering the receipt for an account the user has moved on from.
  const shell = readCode('NewAccountFlow.jsx');
  const fn = shell.slice(shell.indexOf('const finish ='), shell.indexOf('const ctx ='));
  assert.match(fn, /clearStoredDraft\(\)/);
  assert.match(fn, /navigate\('\/'\)/);
});
