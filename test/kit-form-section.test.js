import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legacyCss } from './helpers/app-css.js';

/* THE KIT'S FORM SECTION — Cycle 00, piece 5.
 *
 * The four parts a form needs that the app did not have: a titled GROUP, a two-column
 * GRID, a way to SPAN it, and a FOOTER that knows whether it can be submitted. The
 * individual field was already done — `field.jsx`, approved in Batch 2 on Base UI's
 * Field — and is deliberately untouched.
 *
 * WHAT IS DELIBERATELY NOT HERE. How it LOOKS is the owner's, on the Test page. All three
 * questions were ANSWERED 2026-09-10 — Save greys out until something changes, the Symbol
 * list is OPEN, and it offers the clean symbol — and `primitives-status.test.js` now holds
 * three `@design approved` lines. The rulings are pinned below, the OPEN one hardest:
 * a combobox that has not been wired for it is a closed list that looks identical.
 *
 * THE TWO ASSERTIONS THAT MATTER MOST are the registry-divergence guard and the
 * `columns`-is-a-prop one. Both protect against a change that would look reasonable,
 * pass review, and silently regress something.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(at(p), 'utf8');

const form = read('../frontend/src/components/primitives/form-section.jsx');
const fieldset = read('../frontend/src/components/ui/fieldset.jsx');
const field = read('../frontend/src/components/primitives/field.jsx');
const genField = read('../frontend/src/components/ui/field.jsx');
const barrel = read('../frontend/src/components/primitives/index.js');
const kit = read('../frontend/src/features/dev/KitFormSection.jsx');
const combobox = read('../frontend/src/components/primitives/combobox.jsx');
const datePicker = read('../frontend/src/components/primitives/date-picker.jsx');
const genSelect = read('../frontend/src/components/ui/select.jsx');

/* Strip first, always — the arguments in this file quote the class names being asserted
 * absent. Third over-broad-scan trap of the cycle; kit-filter-bar hit it twice. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const code = strip(form);
/* STRIPPED ONCE, HERE, AND EVERY `doesNotMatch` USES IT.
 *
 * Five times in this cycle a negative scan over a whole source file has caught the
 * COMMENT explaining why the thing is absent — the specimen quotes `<input type="date">`
 * to say what it replaced, and `XAUUSD.pro` to say which form was NOT chosen. Doing the
 * strip at each call site is how one gets forgotten, so it is done once. A word in a
 * comment is not a usage. */
const kitCode = strip(kit);

test('the section is a real fieldset, on the same Base UI family as our Field', () => {
  /* §1 step 3. `@coss/fieldset` was installed 2026-09-10 rather than hand-built, and it
   * matters that it is BASE UI: `field.jsx` runs on `@base-ui/react/field`, and a
   * grouping component from a different family would be a second implementation of the
   * same idea sitting next to the first.
   *
   * The accessibility half is the reason it is not a styled div: a real <fieldset> with
   * a real <legend> is announced when focus enters any control inside it, and no
   * arrangement of divs reproduces that. */
  assert.match(
    code, /from '@\/components\/ui\/fieldset'/,
    'the form section no longer uses the generated fieldset. If it is drawing its own '
      + 'group heading, the <legend> semantics are gone and §1 step 3 was skipped.',
  );
  assert.match(
    fieldset, /@base-ui\/react\/fieldset/,
    'ui/fieldset.jsx is no longer the Base UI Fieldset. Our Field is Base UI; a group '
      + 'from another family is a second implementation of one idea.',
  );
  assert.match(
    field, /@\/components\/ui\/field/,
    'field.jsx no longer wraps the generated Field — the two halves of a form have '
      + 'diverged.',
  );
});

test('⚠ the generated Field is still the BASE UI one, which is why we cannot re-install', () => {
  /* THE FINDING OF THIS PIECE, AND THE ONE MOST LIKELY TO BE UNDONE BY A HELPFUL PERSON.
   *
   * shadcn's registry SHIPS the whole section anatomy — FieldSet, FieldLegend,
   * FieldGroup, FieldContent, FieldTitle, FieldSeparator — so by the build order we
   * should have taken it. We must not, and the reason is not taste:
   *
   *   · what is on disk  — 78 lines on `@base-ui/react/field`
   *   · what the registry serves now — 239 lines of plain <div>/<p> with `cva`, no Base
   *     UI Field anywhere in it, and `import { cn } from "cn"` (the junk npm package
   *     that clobbered four locked components on 09-09)
   *
   * Re-installing would delete the aria wiring `field.jsx` was APPROVED for, remove
   * FieldControl and FieldValidity, and change FieldError from a ValidityState-driven
   * component to one taking an `errors` prop — which the account page's unique-name rule
   * was built against.
   *
   * This test is the tripwire. If someone runs `shadcn add field` to "get the section
   * properly", this fails and explains why that is a regression rather than an upgrade. */
  assert.match(
    genField, /@base-ui\/react\/field/,
    'ui/field.jsx is no longer on Base UI\'s Field. If this was a `shadcn add field`, it '
      + 'is a REGRESSION, not an update: the registry rewrote this component as plain '
      + 'markup, and re-installing removes the aria wiring, FieldControl, FieldValidity, '
      + 'and FieldError\'s ValidityState behaviour. Revert it. The section parts come '
      + 'from @coss/fieldset (Base UI) precisely so this file never has to move.',
  );
  assert.doesNotMatch(
    genField, /from "cn"/,
    'ui/field.jsx now imports the junk `cn` npm package instead of @/lib/utils. That is '
      + 'the 09-09 clobber recurring — repoint the import and `npm uninstall cn`.',
  );
  assert.match(
    form, /239 lines|has been REWRITTEN|diverged/i,
    'the divergence is no longer explained in the file. It is the one thing about this '
      + 'piece a reader cannot derive: the registry ships what we appear to be missing, '
      + 'and the argument for not taking it has to survive.',
  );
});

test('the grid\'s columns are a PROP, because a class there compiles to nothing', () => {
  /* §1's own worked example, and the fault that has cost this codebase real time five
   * times. Every caller of this component lives in a MODAL — that is, in `features/`,
   * outside Tailwind's `@source`. A `grid-cols-3` written there emits NO CSS at all,
   * silently, and the grid stays at two with no error anywhere.
   *
   * So the template travels as an inline style, which no build step can drop. */
  assert.match(
    code, /gridTemplateColumns/,
    'the column template is no longer an inline style. If callers are now expected to '
      + 'pass `grid-cols-*`, that class compiles to NOTHING outside components/ and every '
      + 'form silently stays at two columns.',
  );
  assert.match(
    code, /columns = 2/,
    'FormGrid lost its `columns` prop. The two-column default is `.at-form`\'s and is '
      + 'what nine modals already use; the prop is how a caller varies it without writing '
      + 'a class that does nothing.',
  );
});

test('the footer owns the submit rule, and dirty defaults to a no-op', () => {
  /* §4.3 asked for the footer AND its disabled/dirty states. The states are the whole
   * deliverable: `.modal footer` is nine lines of flexbox every dialog gets free,
   * whereas "is this submittable" is re-decided by hand in each of the nine.
   *
   * `dirty = true` is load-bearing, not a hedge. NO form in this app tracks dirtiness —
   * there is no isDirty/hasChanges/unsaved anywhere in the source — and §2 forbids
   * building a control the product cannot honour. Defaulting to "assume submittable"
   * means adopting this footer changes no shipped screen's behaviour, while a form that
   * DOES know its initial values can pass `dirty={false}` and get the state. */
  /* RULED 2026-09-10: Save greys out until something changes. That is a policy about
   * FORMS; the DEFAULT here is a separate question about this API, and they are not in
   * conflict. Default `false` would make a forgotten `dirty` prop ship a Save button
   * nobody can press — a dead control in production. Default `true` makes a forgotten
   * prop reproduce today's behaviour, which is not a regression. Loud failure is usually
   * right in this codebase, but not when the loud failure is an unsubmittable form. */
  assert.match(
    code, /dirty = true/,
    'the dirty default flipped. `dirty = false` by default would ship a permanently dead '
      + 'Save on any form that forgets the prop. The RULING (Save greys out until '
      + 'something changes) is carried by each migrated form computing `dirty`, not by '
      + 'this default — see the specimen, which derives it.',
  );
  assert.match(
    kit, /const dirty = /,
    'the specimen no longer DERIVES dirty from the values the form opened with. It was a '
      + 'switch while the question was open; the question was answered on 2026-09-10, and '
      + 'a switch that outlives its question is how one component looks like two.',
  );
  assert.match(
    code, /pending \|\| disabled \|\| !dirty/,
    'the submit rule changed shape. It exists so nine dialogs stop each deciding '
      + 'separately what blocks a save.',
  );
  assert.match(
    code, /disabled=\{pending\}/,
    'Cancel is no longer disabled while pending. That is a deliberate behaviour: the '
      + 'request cannot be recalled, so a live Cancel closes the dialog over a write that '
      + 'still lands.',
  );
});

test('the pending spinner is the one already approved, not a new one', () => {
  /* `spinner.js` was approved 2026-09-08 WITH NO CALL SITES, and its entry in
   * primitives-status says why in as many words: "approved so that the first button that
   * needs one is not inventing it". This is that button, and this asserts it did not
   * invent one anyway. */
  assert.match(
    code, /from '\.\/spinner\.js'/,
    'the footer is not using the approved Spinner. If it is drawing its own pending '
      + 'affordance, that is exactly what spinner.js was signed off early to prevent.',
  );
  assert.doesNotMatch(
    code, /animate-spin|<svg/,
    'the footer is hand-drawing a spinner. Use the primitive.',
  );
});

test('the field itself was NOT re-opened — Batch 2 stays locked', () => {
  /* `Field` is approved and locked as a FAMILY with six other controls that share a
   * height, a corner and a text size. The span had an obvious home as a `wide` prop on
   * Field, and it is a FormWide component instead precisely so that lock is not
   * re-opened to solve a problem belonging to the grid. */
  assert.match(
    code, /col-span-full/,
    'FormWide lost its span. `.at-wide` is `grid-column: 1 / -1` and three things in '
      + 'every modal need it: a comments field, an error line, and the actions row.',
  );
  assert.doesNotMatch(
    code, /from '\.\/field\.jsx'/,
    'the form section now imports Field. It should not need to: the field is the '
      + 'caller\'s to place, and wrapping it here would put layout inside an approved, '
      + 'locked component\'s seam.',
  );
});

test('Symbol is a type-to-filter Combobox, and only Symbol is', () => {
  /* OWNER, 2026-09-10: "dropdown should be there for symbol with search as well… with
   * type i mean". Added `primitives/combobox.jsx` on @shadcn/combobox — Base UI's
   * Combobox, the same family as Select, Field and Fieldset.
   *
   * THE RESTRAINT IS THE PART WORTH PINNING. Session has three options and Direction has
   * two; a search box over three items is furniture, and §2 says a control the product
   * does not need is not built because a neighbouring one has it. The rule: a Select
   * becomes a Combobox when the list outgrows the EYE, not when it outgrows the
   * developer. If this test fails because Session became a Combobox, that is the drift
   * it exists to catch. */
  const cbCode = strip(combobox);
  assert.match(
    cbCode, /from '@\/components\/ui\/combobox'/,
    'the combobox is no longer the registry component. Base UI ships this one and it is '
      + 'the same family as our Select and Field — a hand-rolled type-ahead here would be '
      + '§1 step 2 skipped.',
  );
  assert.match(
    cbCode, /data-overlay-surface/,
    'the combobox popup no longer declares itself an overlay. Every row inside it would '
      + 'hover to a CARD\'s hover while sitting on a panel — the eighth instance of that '
      + 'fault, and generated-resets.test.js derives the set that needs the attribute.',
  );
  assert.match(
    cbCode, /overlay-motion/,
    'the combobox lost §10\'s motion. Unlike the SHEET, this popup animates with the '
      + 'animate-in keyframe classes, so overlay-motion genuinely reaches it — the '
      + 'registry hardcodes duration-100, which is on nobody\'s ladder.',
  );
  assert.match(
    kit, /<Combobox[\s\S]{0,80}items=\{SYMBOLS\}/,
    'the Symbol field is no longer a Combobox. It ships as free text today '
      + '(`<input placeholder="EURUSD">`), which accepts EURSUD silently — this is the '
      + 'rare kit part that ADDS a constraint rather than restyling one.',
  );

  /* RULED OPEN (owner, 2026-09-10) — AND OPEN IS WIRING, NOT A FLAG.
   *
   * This is the assertion that exists because the claim "it is already open" was made
   * and was WRONG. Base UI keeps the SELECTED item (`value`) and the TYPED text
   * (`inputValue`) apart; text matching nothing selects nothing, so a combobox left
   * alone is effectively a CLOSED list — and it never says so, because the control looks
   * identical either way and the typed text simply evaporates on submit.
   *
   * Both bindings, or the ruling is silently not implemented. */
  for (const binding of ['inputValue=', 'onInputValueChange=']) {
    assert.ok(
      kit.includes(binding),
      `the Symbol combobox lost \`${binding}\`, so the list is CLOSED again — typing an `
        + 'instrument that is not in the list will select nothing and the text will be '
        + 'dropped on submit, with no error. Ruled OPEN on 2026-09-10.',
    );
  }
  assert.match(
    kit, /saved as typed/,
    'the empty state no longer says the list is open. A bare "No matches" reads as a dead '
      + 'end, which is the other half of why a closed combobox passes for an open one.',
  );
  /* SCOPED TO THE ARRAY, NOT THE FILE — fourth over-broad negative scan of the cycle and
   * the second in this test alone. The questions pane legitimately DISCUSSES
   * `XAUUSD.pro` in prose, inside <code>, to say which form was not chosen; stripping
   * comments does not remove rendered text. What the ruling is about is the LIST, so
   * slice the list out and scan that. */
  const symbolList = kit.slice(kit.indexOf('const SYMBOLS = ['), kit.indexOf('];', kit.indexOf('const SYMBOLS = [')));
  assert.ok(symbolList.includes('XAUUSD'), 'the SYMBOLS fixture could not be sliced out');
  assert.doesNotMatch(
    symbolList, /\.pro|\.cash|\.raw/,
    'the symbol list is offering BROKER symbols. Ruled 2026-09-10: the clean symbol '
      + '(XAUUSD), which is what the Trade Log column, the drawer heading and every '
      + 'analytics grouping use — the broker string splits one instrument across firms.',
  );
  assert.doesNotMatch(
    kitCode, /<Combobox[\s\S]{0,400}SESSIONS/,
    'Session has become a Combobox. Three options do not need a search box (§2). A '
      + 'Select becomes a Combobox when the list outgrows the EYE.',
  );
});

test('the date field is OUR calendar, and its trigger is a field not a button', () => {
  /* OWNER, 2026-09-10: "for this calendar take it from shadcn". The form was rendering
   * `<input type="date">` — the BROWSER's picker, drawn outside our stylesheet entirely,
   * different on every OS, with Chrome's own Clear/Today links and blue selection. It is
   * the one control on the page no design language could reach.
   *
   * TWO THINGS ARE PINNED AND THE SECOND IS THE FRAGILE ONE. */
  const dpCode = strip(datePicker);
  assert.match(
    dpCode, /from '@\/components\/ui\/calendar'/,
    'the date picker is no longer on the generated calendar.',
  );
  /* STRIPPED, because the specimen's own comment explains what it replaced and quotes
     `<input type="date">` to do it. Fourth time this cycle a `doesNotMatch` over a whole
     source file caught the paragraph saying why the thing is absent. A word in a comment
     is not a usage — strip first, always. */
  assert.doesNotMatch(
    kitCode, /type="date"/,
    'the native date input is back. That renders the BROWSER\'s calendar, which our '
      + 'stylesheet cannot reach and which looks different on every OS.',
  );

  /* THE TRIGGER SHARES `SelectTrigger`'S RECIPE, AND MUST KEEP SHARING IT.
   *
   * This control sits in a form grid beside an Input and below a Select. shadcn's own
   * date-picker example uses `Button variant="outline"`, which among filled fields reads
   * as an ACTION rather than a value. A Select trigger is the same problem already
   * solved — a button that must look like a field — so the recipe is copied from it.
   *
   * Reusing the component is impossible (it needs Select's context), so a COPY is the
   * only option, and a copy is exactly what drifts. If SelectTrigger is ever re-skinned
   * this fails, rather than the date field quietly becoming the one field in the app
   * with a different fill. */
  for (const token of ['h-8', 'rounded-2xl', 'border-transparent', 'bg-input/50']) {
    assert.ok(
      dpCode.includes(token),
      `the date trigger lost \`${token}\`, so it no longer wears the field surface. It `
        + 'sits between an Input and a Select; a button among filled fields reads as an '
        + 'action.',
    );
    assert.ok(
      genSelect.includes(token),
      `SelectTrigger no longer declares \`${token}\`. The date trigger COPIES its recipe `
        + 'because it cannot reuse the component — if the Select was re-skinned, re-skin '
        + 'this with it or the two fields stop matching.',
    );
  }
});

test('every part is exported from the barrel, because that is the only door', () => {
  for (const name of ['FormSection', 'FormGrid', 'FormWide', 'FormFooter']) {
    assert.ok(
      new RegExp(`\\b${name}\\b`).test(barrel),
      `${name} is not exported from primitives/index.js. Application code imports the `
        + 'barrel and nothing else.',
    );
  }
});

test('nothing is migrated, and the bare element selectors are still standing', () => {
  /* THE SEQUENCING, PINNED — the same guard pieces 3 and 4 carry.
   *
   * The form layer here is unusual and it is worth the test saying so: it is not a
   * `.form-*` family, it is BARE ELEMENT SELECTORS scoped to a dialog. That is why the
   * Cycle 00 audit never counted it, and why `modal.jsx` had to keep the class `modal`
   * when the shell migrated — nineteen content rules hang off it, and dropping the class
   * would have unstyled the inside of all thirteen dialogs at once. */
  for (const sel of [
    '\\.modal input',
    '\\.modal footer',
    '\\.modal button\\.primary',
    '\\.field-row',
    '\\.at-form',
  ]) {
    assert.match(
      legacyCss, new RegExp(sel),
      `\`${sel}\` is gone from legacy CSS. If a dialog has been migrated, good — but the `
        + 'rules and their names in test/fixtures/legacy-classes.txt are deleted in the '
        + 'SAME commit, and this test moves with them.',
    );
  }
});

test('the specimen is the REAL form, not an invented one', () => {
  /* Brief §5. Eleven fields at the modal's real 448px is the thing being judged; the
   * same parts at the page's 1080px would answer a different question, and a form of
   * lorem would answer none. */
  assert.match(
    kit, /maxWidth: 448/,
    'the specimen no longer renders at the modal\'s real width. modal.jsx\'s shell is '
      + '`max-w-md`, and a form judged wider than it ever gets is not judged.',
  );
  for (const label of ['Result \\(R\\)', 'MFE|SL size', 'Comments']) {
    assert.match(
      kit, new RegExp(label),
      'the specimen has drifted from AddTradeModal\'s real fields. §2 keeps the structure '
        + 'where it is — the review is of the parts, not of a redesigned form.',
    );
  }
});
