import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appFiles, readSrc } from './helpers/src-files.js';

/* THE FORM FAMILY AGREES — the ratchet behind Batch 2 of the primitive review.
 *
 * PRIMITIVE-REVIEW-PLAN §5 is the whole argument for reviewing in batches: a text box, a
 * picker, a tick box and a button sit on ONE row of ONE form, so they have to share a
 * height, a corner and a text size. Locking them one at a time guarantees the second one
 * reopens the first. That argument is only worth anything if the agreement is then held —
 * otherwise the batch is signed off once and drifts apart in the next commit that touches
 * a single member.
 *
 * SO WHAT IS ASSERTED HERE IS AGREEMENT, NOT VALUES. This file does not say "an input is
 * 32px"; it says "whatever the input is, the select trigger and the button say the same
 * thing in the same words". A deliberate change to the family still passes, as long as it
 * is made to the family. That is exactly the failure that prompted the file.
 *
 * ── THE BUG THIS WAS WRITTEN FOR (2026-09-07) ──────────────────────────────────────────
 *
 * `primitives/select.jsx` builds its option rows by hand, from the generated component's
 * class list, because the generated row carries `grid` and legacy/app.css claims that name
 * unlayered for the Trade Log. It was copied faithfully — except for `sm:min-h-7
 * sm:text-sm`, which at the time compiled to NOTHING: bridge.css had cleared Tailwind's
 * min-width breakpoints outright, so dropping two inert classes was correct.
 *
 * bridge.css then re-declared `--breakpoint-sm: 40rem` (2026-09-07, to un-break the
 * alert-dialog, which was stuck in its phone layout). Every `sm:` in the library came back
 * — except in the one row that no longer had them. The visible result was a select whose
 * value read 14px in the closed trigger and 16px in the open list: the text changed size
 * as the panel opened, and the rows stood 32px against the dropdown menu's 28px, on a
 * family §6 locked together precisely so that could not happen.
 *
 * Nothing caught it. The row's classes were valid, the component rendered, every existing
 * test passed, and the comment above it explained a build that no longer existed. That is
 * the shape to guard: a HAND-COPIED class list silently falling behind the generated one
 * it was copied from.
 */

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const ui = (n) => read(`../frontend/src/components/ui/${n}`);
const prim = (n) => read(`../frontend/src/components/primitives/${n}`);

/* Class lists only. A header that DISCUSSES `text-base` must not read as one that applies
 * it — three of these files argue about their own classes at length, which is the point of
 * them, and `primitives-status.test.js` learned the same lesson. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* The one string literal in the file that carries the component's own utilities. Passing
 * an anchor rather than "the longest string" keeps a failure legible: it names which list
 * moved, not which string happened to grow. */
function classesContaining(src, anchor, label) {
  const hit = stripComments(src)
    .split(/['"`]/)
    .filter((s) => s.includes(anchor) && /\s/.test(s));
  assert.ok(hit.length > 0, `${label}: found no class list containing "${anchor}"`);
  return hit.join(' ');
}

const has = (list, cls) => new RegExp(`(^|\\s)${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(list);

/* ── the four that sit on one row ─────────────────────────────────────────────────────
 *
 * ALL FOUR ARE NOW THE GENERATED COMPONENT, and that is the change this file exists to
 * record. Input and Textarea always were pass-throughs. The SELECT TRIGGER became one on
 * 2026-09-07: `shadcn add select` brought a rewritten component whose trigger is
 * `rounded-2xl border-transparent bg-input/50 h-8 text-sm` — our Input's shape, line for
 * line — so the re-skin this file was written to police is deleted. The wrapper keeps two
 * form-specific classes (`w-full`, because the generated trigger is `w-fit` and a form
 * cell is not a toolbar; `px-2.5`, to match the Input's padding to the pixel).
 *
 * So the assertions move with it: agreement is now checked between GENERATED files, and
 * separately that our wrapper still supplies the two things a form needs. That is a
 * stronger position than before — there is no copy left to fall behind. */

const INPUT = classesContaining(ui('input.jsx'), 'rounded-2xl', 'ui/input.jsx');
const TEXTAREA = classesContaining(ui('textarea.jsx'), 'rounded-2xl', 'ui/textarea.jsx');
const TRIGGER = classesContaining(ui('select.jsx'), 'data-[size=default]:h-8', 'ui/select.jsx trigger');
const BUTTON = classesContaining(ui('button.jsx'), 'rounded-2xl', 'ui/button.jsx');
const ROW = classesContaining(ui('select.jsx'), 'pr-8 pl-2', 'ui/select.jsx item');
const MENU_ROW = classesContaining(ui('dropdown-menu.jsx'), 'group/dropdown-menu-item', 'ui/dropdown-menu.jsx');

test('the select trigger draws the same field as the input beside it', () => {
  /* THE READING IS "same field", not "same class list": the trigger is a button and the
     input is an input, so they will never share every utility. These are the ones a user
     sees when the two sit on one line of the Add Account form — and every one of them
     used to be a difference our wrapper corrected by hand. */
  for (const cls of ['rounded-2xl', 'border-transparent', 'bg-input/50']) {
    assert.ok(has(INPUT, cls), `ui/input.jsx no longer declares ${cls} — the family moved without the select`);
    assert.ok(has(TRIGGER, cls), `the generated select trigger dropped ${cls}; it must match the Input it sits beside`);
  }
  assert.ok(has(INPUT, 'h-8'), 'ui/input.jsx is no longer h-8');
  assert.ok(
    has(TRIGGER, 'data-[size=default]:h-8'),
    'the generated trigger must still settle at 32px in its default size, like the Input',
  );
  /* The OLD generated trigger wrote its own shadow and its own hairline, and the wrapper
     spent two classes killing them (§7: elevation comes from the ladder, and a field on a
     form is level 0). The rewritten one writes neither. If either comes back, the wrapper
     has to as well — so this asserts the absence rather than our old correction. */
  assert.ok(!/\bshadow-xs\b|\bshadow-sm\b/.test(TRIGGER), 'the generated trigger grew a shadow again (§7)');
  assert.ok(!/before:shadow-/.test(TRIGGER), 'the generated trigger grew a hairline again (§7)');
});

test('the wrapper still gives the trigger the two things a form needs', () => {
  /* The only two overrides left, and both are about forms rather than taste — a toolbar
     wants `w-fit` and a two-column grid does not. If these are ever dropped, the Add
     Account page gets two pickers of different widths, neither of them the column's. */
  const wrapper = classesContaining(prim('select.jsx'), 'w-full', 'select.jsx TRIGGER');
  assert.ok(has(wrapper, 'w-full'), 'the trigger must fill its form cell — the generated one is w-fit');
  assert.ok(has(wrapper, 'px-2.5'), "the trigger's padding must match the Input's, not the generated px-3");
});

test('the whole family takes the preset control radius, and the button with it', () => {
  /* `--radius-2xl` is 16px in bridge.css, decoupled from the 14px CARD radius, and
     button.jsx DELETED its `rounded-lg` override when §6 was amended (2026-09-07) so the
     button takes what the generated component asks for. That amendment is what makes the
     form controls and the Save button agree — and it is one line in one file away from
     silently un-agreeing. */
  for (const [label, list] of [['input', INPUT], ['textarea', TEXTAREA], ['trigger', TRIGGER], ['button', BUTTON]]) {
    assert.ok(has(list, 'rounded-2xl'), `${label} left the shared control radius`);
  }
  assert.doesNotMatch(
    stripComments(prim('button.jsx')),
    /\brounded-lg\b/,
    'button.jsx re-introduced a radius override; §6 was amended so the button takes the '
      + "preset's `rounded-2xl`, which is what makes it agree with the fields beside it",
  );
});

test('an option row and a dropdown row are the same shape', () => {
  /* §6 locked the overlays as a family, and a select popup is one — it opens on the same
     page as the menu, often from the same toolbar. Both of these used to be corrections
     in our layer: the row was hand-built at 6px and 32px while the menu sat at 14px and
     28px. The rewritten registry component agrees with the menu on its own, so this now
     asserts that the two GENERATED rows keep agreeing rather than that we keep fixing one. */
  assert.ok(has(MENU_ROW, 'min-h-7') && has(ROW, 'min-h-7'), 'an option row and a menu row must settle at the same height');
  assert.ok(has(MENU_ROW, 'rounded-xl') && has(ROW, 'rounded-xl'), 'an option row and a menu row must share a corner');
  assert.ok(has(MENU_ROW, 'text-sm') && has(ROW, 'text-sm'), 'an option row and a menu row must share a text size');
});

/* ── the two owner rulings on the picker, now upstream (2026-09-07) ───────────────────
 *
 * Both reverse a choice this wrapper had made on its own, and both were pinned here
 * because a departure from the library and a return to it are equally easy to "fix" back
 * by someone reading the docs. What changed hours later is WHERE they live: re-installing
 * `@shadcn/select` brought a rewritten component that already does both, so the wrapper
 * that expressed them is deleted and these assertions moved onto the generated file.
 *
 * That is a stronger guarantee, not a weaker one — there is no copy of ours left to drift
 * — but it is a guarantee about someone else's component, so it has to be checked rather
 * than assumed. If a future `shadcn add select` walks either of them back, this fails and
 * the wrapper comes back with a reason. */

test('the picker opens on the field, not under it', () => {
  const generated = stripComments(ui('select.jsx'));
  assert.match(
    generated, /alignItemWithTrigger\s*=\s*true/,
    'the generated SelectContent no longer defaults alignItemWithTrigger to true. The '
      + 'owner reviewed both and chose that behaviour — the selected row settles ON the '
      + 'trigger, the way a native dropdown does.',
  );
  assert.doesNotMatch(
    stripComments(prim('select.jsx')),
    /alignItemWithTrigger\s*=\s*\{\s*false\s*\}/,
    'select.jsx is overriding alignItemWithTrigger back to false. That was this wrapper\'s '
      + 'own call before the owner ruled against it, not a constraint.',
  );
  /* The scroll arrows matter in this mode: aligned to the trigger, a list too long for
     the space scrolls in place rather than flipping, and they are the only thing that
     says so. A hand-built popup dropped them silently once already. */
  for (const part of ['SelectScrollUpButton', 'SelectScrollDownButton']) {
    assert.match(generated, new RegExp(part), `the generated popup must still render ${part}`);
  }
});

test('the tick trails the label, so the value does not move when the list opens', () => {
  /* THE POINT IS THE ORDER, and it is the whole reason for the ruling. A LEADING
     indicator needs a reserved column, a reserved column indents every label past it, and
     the selected value then sits at one x-position closed and ~24px right of it open. The
     owner caught that from a screenshot of the version we were shipping.

     The rewritten component does better than our fix did: the indicator is absolutely
     positioned at `right-2` and takes no part in layout at all, so it cannot move a label
     whether it is mounted or not. Base UI unmounts it on unselected rows — that fact is
     what made this impossible to express as a className on the OLD generated row, and is
     why the row was hand-built for a day. */
  const generated = stripComments(ui('select.jsx'));
  const text = generated.indexOf('SelectPrimitive.ItemText');
  const indicator = generated.indexOf('SelectPrimitive.ItemIndicator');
  assert.ok(text > 0 && indicator > 0, 'ui/select.jsx no longer renders both row parts');
  assert.ok(
    text < indicator,
    'the tick has moved back in front of the label in the generated row. It indents every '
      + 'label past a reserved column and makes the selected value jump right as the list '
      + 'opens. Owner ruling, 2026-09-07 — bring the wrapper back rather than accept it.',
  );
  assert.match(
    generated, /absolute right-2/,
    'the indicator must stay out of the row\'s layout flow, so mounting and unmounting it '
      + 'cannot move the label',
  );
});

/* ── a disabled control says so under the cursor (owner, 2026-09-08) ──────────────────
 *
 * "the pills which are disabled should have cursor change when hover over disabled pill or
 * text field". The reason it did not looks like a missing class and is the opposite: an
 * INERT one. `pointer-events: none` means the element receives no pointer events at all,
 * so the cursor never enters it and no `cursor` value can ever apply.
 *
 * The Input is the proof. It has always declared BOTH `disabled:pointer-events-none` and
 * `disabled:cursor-not-allowed`, and the second has never once rendered. Textarea and
 * Checkbox omit `pointer-events-none` and have been correct all along — which is how the
 * app came to be inconsistent about this without anyone having decided to be.
 *
 * The fix is a utility rather than CSS because that is the only DETERMINISTIC mechanism
 * here: a stylesheet rule would have to out-specify `.disabled\:pointer-events-none:disabled`
 * and would land in a specificity race, while `cn()` — tailwind-merge — sees the same
 * variant and the same property group and drops the generated class outright. Verified:
 * twMerge('disabled:pointer-events-none', 'disabled:pointer-events-auto') keeps only the
 * second.
 *
 * This asserts the OUTCOME, not the spelling: every control the owner named must end up
 * able to show a cursor while disabled, and must say which cursor. It deliberately covers
 * the two that were already right, because "textarea was fine" is exactly the kind of
 * thing that regresses when someone tidies a class list. */
/* THE THIRD ENTRY IS THE ATTRIBUTE THIS CONTROL IS DRIVEN BY, added 2026-09-09.
 *
 * The header above says this test asserts the OUTCOME, not the spelling, and the test
 * below it already makes the distinction in prose: "a Base UI option is a div with
 * `data-disabled`, not a form control with the DOM property". This list did not carry
 * that distinction, so it only ever accepted shadcn's spelling.
 *
 * WHAT MADE IT MATTER: `checkbox` spent a few hours on @coss on 2026-09-09, and coss
 * writes `data-disabled:cursor-not-allowed` — the correct selector for a Base UI control,
 * doing exactly the same job. The rule was satisfied and the test failed, which is a test
 * enforcing an implementation rather than an outcome. The owner then chose the shadcn
 * checkbox (see primitives/checkbox.jsx for why), so this entry is back on `disabled:` —
 * and the third column stays, because the next Base-UI-attribute component will need it
 * and because the distinction is real either way.
 *
 * IT IS STILL STRICT. Each control must declare the cursor under ITS OWN attribute and
 * must not block pointer events under that same attribute, so a component cannot pass by
 * declaring the cursor under one prefix and killing the pointer under the other. */
const CONTROLS = [
  ['button', () => classesContaining(prim('button.jsx'), 'disabled:pointer-events-auto', 'button.jsx'), 'disabled:'],
  ['input', () => classesContaining(prim('input.jsx'), 'disabled:pointer-events-auto', 'input.jsx'), 'disabled:'],
  ['textarea', () => classesContaining(ui('textarea.jsx'), 'disabled:cursor-not-allowed', 'ui/textarea.jsx'), 'disabled:'],
  ['checkbox', () => classesContaining(ui('checkbox.jsx'), 'disabled:cursor-not-allowed', 'ui/checkbox.jsx'), 'disabled:'],
  ['select trigger', () => classesContaining(ui('select.jsx'), 'data-[size=default]:h-8', 'ui/select.jsx trigger'), 'disabled:'],
];

test('a disabled control can be hovered, and says not-allowed when it is', () => {
  for (const [name, get, on] of CONTROLS) {
    const list = get();
    assert.ok(
      has(list, `${on}cursor-not-allowed`),
      `${name} does not declare ${on}cursor-not-allowed — a disabled control must say so under the pointer`,
    );
    assert.ok(
      !has(list, `${on}pointer-events-none`),
      `${name} still blocks pointer events while disabled, so its cursor rule is inert. `
        + `Add ${on}pointer-events-auto in the wrapper — tailwind-merge drops the `
        + 'generated class. A disabled button and a disabled input fire no click and take '
        + "no focus by the platform's rules, not by this class.",
    );
  }
});

test('a disabled option in an open picker says so too', () => {
  // Same rule, different attribute: a Base UI option is a div with `data-disabled`, not a
  // form control with the DOM property. Applying the rule to two of the three places it
  // belongs would be a rule nobody could rely on.
  const row = classesContaining(prim('select.jsx'), 'data-disabled:pointer-events-auto', 'select.jsx SelectItem');
  assert.ok(has(row, 'data-disabled:cursor-not-allowed'), 'a disabled option must say not-allowed');
  assert.ok(!has(row, 'data-disabled:pointer-events-none'), 'a disabled option still blocks pointer events');
});

/* ── the rejected field says so twice (owner, 2026-09-07) ─────────────────────────────
 *
 * The owner chose "the box AND the sentence" over "only the sentence" for a field that
 * fails validation. That was not a change: this app has exactly ONE validated field
 * today, AccountStep's account name, and it already sets `aria-invalid` beside its
 * `FieldError` — a fact I got wrong when I put the question, and worth recording because
 * the wrong version reached the owner as an open decision.
 *
 * So what the answer buys is not a fix, it is a rule, and the rule has to bite on the
 * SECOND one. The failure mode is obvious once written down and invisible in review: a
 * new form renders the red sentence, forgets the attribute, and the field beside it looks
 * perfectly fine while being rejected. The preset already ships the styling
 * (`aria-invalid:border-destructive aria-invalid:ring-3` on Input, Textarea and
 * Checkbox); nothing has to be built, only remembered.
 *
 * BASE UI OFFERS A WAY TO MAKE IT UNFORGETTABLE, and the next caller should prefer it:
 * `<Field invalid>` propagates to the control on its own — `Field.Root` computes
 * `valid = !invalid && ...` and `useFieldValidation` then puts `aria-invalid` on the
 * control, because Base UI's `Input` IS `Field.Control`. One prop instead of two that
 * can disagree. This test accepts either spelling. */
test('a field that renders an error also marks itself invalid', () => {
  const offenders = [];
  for (const f of appFiles({ ext: /\.jsx$/ })) {
    const src = stripComments(readSrc(f));
    if (!/<FieldError\b/.test(src)) continue;
    if (/aria-invalid=/.test(src) || /<Field\b[^>]*\binvalid\b/.test(src)) continue;
    offenders.push(f);
  }
  assert.deepEqual(
    offenders, [],
    'a form renders <FieldError> but never marks the field invalid, so the box looks '
      + 'normal while being rejected. Set aria-invalid on the control, or invalid on '
      + 'the Field and let Base UI propagate it. Owner ruling 2026-09-07: the box AND '
      + 'the sentence.',
  );
});

/* ── the comment ratchet ───────────────────────────────────────────────────────────────
 *
 * The class list above is half the failure. The other half is that select.jsx CARRIED A
 * PARAGRAPH explaining, correctly for the build it was written in, that `sm:` compiled to
 * nothing — and that paragraph is why the missing steps read as deliberate for as long as
 * they did. The preset-parity note records this as a recurring shape: "stale mappings
 * outlive the fix written for them", and "a comment is the one part of a file no test
 * reads".
 *
 * This one does, and it is narrow on purpose. It does not police prose and it does not
 * forbid telling the story — select.jsx SHOULD say what it used to say and why, because
 * the next person to read that row needs to know it was once correct. What it forbids is
 * the claim standing ALONE: a file may say `sm:` was dead only if it also says it is not
 * any more, in the same file, where the person acting on it will see it. */
const RETRACTION = /NO LONGER TRUE|re-declared/;

test('no primitive leaves a dead-breakpoint claim standing on its own', () => {
  const bridge = read('../frontend/src/styles/bridge.css');
  const live = ['sm', 'md'].filter((b) => new RegExp(`--breakpoint-${b}\\s*:\\s*[^;i]`).test(bridge));
  assert.deepEqual(
    live.sort(), ['md', 'sm'],
    'bridge.css no longer declares both breakpoints. If that is deliberate, every hand-'
      + 'copied class list that kept a `sm:` step is now carrying an inert class — start '
      + 'with select.jsx — and this test needs the new reason written into it.',
  );

  const dir = fileURLToPath(new URL('../frontend/src/components/primitives/', import.meta.url));
  for (const f of readdirSync(dir).filter((n) => /\.(jsx|js)$/.test(n))) {
    const src = readFileSync(dir + f, 'utf8');
    for (const b of live) {
      const claims = new RegExp(`\`?${b}:\`?[^.\\n]{0,40}\\b(IS|WAS) DEAD\\b`, 'i').test(src);
      if (!claims) continue;
      assert.match(
        src,
        RETRACTION,
        `${f} says \`${b}:\` is dead and never says otherwise, but bridge.css declares `
          + `--breakpoint-${b}. That sentence is how a component ends up with the `
          + 'responsive steps stripped out of a class list nobody re-reads. Either delete '
          + 'the claim or record that it expired — and check the class lists either way.',
      );
    }
  }
});
