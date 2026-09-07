import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
 * Input and Textarea are pass-throughs — `primitives/input.js` re-exports the generated
 * component untouched — so the generated file IS ours and is read directly. The select
 * trigger is the only one of the four our layer restates, which is why it is the only one
 * that can disagree. */

const INPUT = classesContaining(ui('input.jsx'), 'rounded-2xl', 'ui/input.jsx');
const TEXTAREA = classesContaining(ui('textarea.jsx'), 'rounded-2xl', 'ui/textarea.jsx');
const TRIGGER = classesContaining(prim('select.jsx'), 'rounded-2xl', 'select.jsx TRIGGER');
const BUTTON = classesContaining(ui('button.jsx'), 'rounded-2xl', 'ui/button.jsx');

test('the select trigger draws the same field as the input beside it', () => {
  /* THE READING IS "same field", not "same class list": the trigger is a button and the
     input is an input, so they will never share every utility. These five are the ones a
     user sees when the two sit on one line of the Add Account form — and each of them was
     a real difference in the generated trigger before this wrapper corrected it
     (`border-input bg-background rounded-lg` with a shadow, 36px tall). */
  for (const cls of ['rounded-2xl', 'border-transparent', 'bg-input/50', 'px-2.5']) {
    assert.ok(has(INPUT, cls), `ui/input.jsx no longer declares ${cls} — the family moved without the select`);
    assert.ok(has(TRIGGER, cls), `select.jsx's trigger dropped ${cls}; it must match the Input it sits beside`);
  }
  assert.ok(has(INPUT, 'h-8'), 'ui/input.jsx is no longer h-8');
  assert.ok(
    has(TRIGGER, 'h-8') && has(TRIGGER, 'min-h-8'),
    'select.jsx must pin BOTH — Input sets a fixed height and the generated trigger only a '
      + 'minimum, so a stray line-height grows one and not the other',
  );
  /* The generated trigger writes its own shadow and its own hairline. §7 says elevation
     comes from the ladder and no component writes its own; a field on a form is level 0. */
  assert.ok(
    has(TRIGGER, 'shadow-none') && has(TRIGGER, 'before:hidden'),
    'select.jsx must keep killing the generated shadow and hairline (§7)',
  );
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
      + 'preset\'s `rounded-2xl`, which is what makes it agree with the fields beside it',
  );
});

test('the hand-copied select row keeps every responsive step of the row it was copied from', () => {
  /* THE ACTUAL REGRESSION GUARD. `SelectItem` is rendered from the Base UI parts rather
     than the generated component — it has to be, because the generated row carries `grid`
     and legacy/app.css claims that name unlayered — so it is a hand-copy, and a hand-copy
     is what falls behind. Whatever `sm:` steps the generated row declares, ours declares
     too. */
  const generated = classesContaining(ui('select.jsx'), 'grid-cols-[1rem_1fr]', 'ui/select.jsx SelectItem');
  const ours = classesContaining(prim('select.jsx'), 'rounded-xl px-2', 'select.jsx SelectItem');

  const steps = [...generated.matchAll(/(?:^|\s)(sm:[^\s'"`]+)/g)].map((m) => m[1]);
  assert.ok(steps.length >= 2, 'expected the generated select row to carry sm: steps');

  for (const step of steps) {
    if (step.includes('[&_svg')) continue; // icon sizing; our row draws its own indicator
    assert.ok(
      has(ours, step),
      `select.jsx's SelectItem is missing ${step}. It was copied from the generated row `
        + 'while `sm:` compiled to nothing; bridge.css has re-declared --breakpoint-sm, so '
        + 'dropping a step now means the option list renders at a different size from the '
        + 'trigger above it.',
    );
  }
});

test('an option row and a dropdown row are the same height', () => {
  /* §6 locked the overlays as a family, and a select popup is one — it opens on the same
     page as the menu, often from the same toolbar. The RADIUS is knowingly different (6px
     against 14px, a split the preset itself makes between its select and its menu) and is
     an open review question rather than a bug; the HEIGHT is not, and 32px rows beside
     28px ones is what the missing `sm:` step produced. */
  const ours = classesContaining(prim('select.jsx'), 'rounded-xl px-2', 'select.jsx SelectItem');
  const menuRow = classesContaining(ui('dropdown-menu.jsx'), 'group/dropdown-menu-item', 'ui/dropdown-menu.jsx');

  assert.ok(has(menuRow, 'min-h-7'), 'the dropdown row is no longer min-h-7');
  assert.ok(
    has(ours, 'sm:min-h-7'),
    'a select option must settle at the same height as a dropdown row (§6 — the overlays '
      + 'were locked as a family)',
  );
});

/* ── the two owner rulings on the picker (2026-09-07) ──────────────────────────────────
 *
 * Both reverse a choice this wrapper had made on its own, and both are the kind that gets
 * quietly restored by the next person who reads the library docs, sees our code disagree
 * with the default, and "fixes" it. They are pinned for the same reason button.jsx's
 * per-variant open state is: preset parity is not automatically right, and neither is
 * departing from it — the owner decides which, and the decision has to survive. */

test('the picker opens on the field, not under it', () => {
  const src = stripComments(prim('select.jsx'));
  assert.doesNotMatch(
    src,
    /alignItemWithTrigger\s*=\s*\{\s*false\s*\}/,
    'select.jsx is overriding alignItemWithTrigger back to false. The owner reviewed both '
      + 'and chose the library behaviour — the selected row settles ON the trigger, the way '
      + 'a native dropdown does. The `false` was this wrapper\'s own call, not a constraint.',
  );
  /* AND THE PANEL IS THE SHIPPED ONE, which guarantees the rest of this mode better than
     any assertion here could. The scroll arrows matter — aligned to the trigger, a list
     too long for the space scrolls in place rather than flipping, and they are the only
     thing that says so — and a hand-built popup dropped them silently once already.
     Rendering the generated component is how they cannot be dropped again. */
  assert.match(
    src, /UISelectPopup/,
    'select.jsx must render the generated SelectPopup. It was re-implemented once, from '
      + 'the Base UI parts, because the panel surface sits on an inner div with no prop '
      + 'reaching it — but Base UI MERGES a `render` element\'s className, so a wrapper '
      + 'can reach it. The copy lost the scroll arrows and drifted on row size.',
  );
  assert.doesNotMatch(
    src, /SelectPrimitive\.(Portal|Positioner|List)\b/,
    'select.jsx is hand-building the popup again — see the note above `PANEL`. §1 build '
      + 'order is shadcn -> @coss -> composition -> hand-written, and the panel is the '
      + 'third step: one `render` className, two locked properties.',
  );
});

test('the tick trails the label, so the value does not move when the list opens', () => {
  /* THE POINT IS THE ORDER, and it is the whole reason for the ruling. A leading
     indicator needs a reserved column, a reserved column indents every label past it, and
     the selected value then sits at one x-position closed and ~24px right of it open. The
     owner caught that from a screenshot. Asserting the order is asserting that. */
  const src = stripComments(prim('select.jsx'));
  const text = src.indexOf('SelectPrimitive.ItemText');
  const indicator = src.indexOf('SelectPrimitive.ItemIndicator');
  assert.ok(text > 0 && indicator > 0, 'select.jsx no longer renders both row parts');
  assert.ok(
    text < indicator,
    'the tick has moved back in front of the label. Both shadcn and @coss ship it that '
      + 'way, so this reads as parity — but it indents every label past a reserved column '
      + 'and makes the selected value jump right as the list opens. Owner ruling, 2026-09-07.',
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
