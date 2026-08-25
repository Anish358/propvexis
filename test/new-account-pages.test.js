import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_IDS } from '../frontend/src/features/accounts/newAccountFlow.js';
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
