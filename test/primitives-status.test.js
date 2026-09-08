import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Primitive status — the ratchet behind DESIGN-LANGUAGE §1 step 1.
 *
 * §1 says "stop at the first step that works", and step 1 is an existing primitive.
 * Taken literally, that rule makes every TEMPORARY primitive permanent: reuse it into
 * thirty screens and it can never be replaced. So step 1 is qualified — it only stops
 * on a SETTLED primitive. A provisional one is a redirect to step 2, not an answer.
 *
 * "Provisional" is not a matter of opinion here. It is derived mechanically: a
 * primitive that still APPLIES a legacy `.u-*` class has not been migrated, whatever
 * its header claims. This test asserts the derived set equals the declared set below,
 * so the list cannot grow by accident and cannot shrink without the class going away.
 *
 * TO CLOSE ONE: migrate the component off `.u-*`, delete its `@status provisional`
 * block, delete its entry here, and delete the dead rules from legacy/app.css.
 * All four in the same commit — that last step is the one that gets skipped.
 */

const DIR = fileURLToPath(new URL('../frontend/src/components/primitives/', import.meta.url));

/* EMPTY SINCE 2026-09-08, and that is the resting state this map was built to reach.
 *
 * Batch 6 was "rebuild first, then review" — three primitives that could not be looked
 * at because they still rendered `.u-*` markup that was going to be replaced. All three
 * are rebuilt: EmptyState on @shadcn/empty, Tabs on @shadcn/tabs `variant="line"`, and
 * LoadingBlock on the Skeleton primitive next door. Twenty-six legacy rules deleted with
 * them, per the standing rule that every edit moves legacy/app.css toward zero.
 *
 * TWO OF THE THREE WERE HELD BACK BY REASONS THAT HAD EXPIRED. `empty-state.jsx` argued
 * "no registry has an empty state" while its own status line named the component that
 * replaced it; `tabs.jsx` argued it was too opinionated for the library, and the library
 * ships our exact underline pattern as `variant="line"`. Only LoadingBlock's argument
 * was still live, and it was answered rather than ignored — see its header.
 *
 * TO REOPEN IT: a primitive that APPLIES a legacy `.u-*` class goes back in here with a
 * reason and an `@status provisional` block. An empty map is not a claim that nothing
 * will ever be provisional again — it is a claim that nothing is TODAY. */
const PROVISIONAL = {};

/* Strip comments, so a header that DISCUSSES `.u-card` is not mistaken for one that
 * renders it. button.jsx and card.jsx are why this matters: both explain at length how
 * they differ from the legacy class, and neither applies it. */
function code(src) {
  const stripLineComment = (line) => {
    // Truncate at the first `//` that is not inside a string literal. It has to handle
    // TRAILING comments, not only whole-line ones — card.jsx carries
    // `md: '...',   // 16px - matches .u-card` and is perfectly well migrated.
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      } else if (ch === '/' && line[i + 1] === '/') {
        return line.slice(0, i);
      }
    }
    return line;
  };
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(stripLineComment)
    .join('\n');
}

const files = readdirSync(DIR).filter((f) => /\.(jsx|js)$/.test(f));
const sources = new Map(files.map((f) => [f, readFileSync(DIR + f, 'utf8')]));

test('the provisional set is exactly the set that still renders legacy CSS', () => {
  // A legacy class inside a string literal is application, not discussion.
  const legacy = /['"`][^'"`\n]*\bu-[a-z][a-z0-9-]*/;
  const derived = files.filter((f) => legacy.test(code(sources.get(f)))).sort();
  assert.deepEqual(
    derived,
    Object.keys(PROVISIONAL).sort(),
    'A primitive started or stopped rendering legacy CSS. If you migrated one, remove '
      + 'it from PROVISIONAL and delete its @status block. If you added one, you have '
      + 'introduced a new temporary primitive — which is what §1 step 1 exists to stop.',
  );
});

test('every provisional primitive says so in its own header', () => {
  // The test is the ratchet; the header is what a developer or an agent actually reads
  // before deciding to reuse the thing. Both, or the mechanism does not work.
  for (const f of Object.keys(PROVISIONAL)) {
    assert.match(
      sources.get(f),
      /@status provisional/,
      `${f} is provisional but does not say so where someone would see it`,
    );
  }
});

test('no settled primitive claims to be provisional', () => {
  for (const f of files) {
    if (f in PROVISIONAL) continue;
    assert.doesNotMatch(
      sources.get(f),
      /@status provisional/,
      `${f} declares itself provisional but is not in PROVISIONAL — one of the two is wrong`,
    );
  }
});

test('a provisional primitive stays exported, because call sites must not churn', () => {
  // The replacement keeps the export name. Screens import the name, not the
  // implementation, so migrating one of these touches one file and not thirty.
  const barrel = readFileSync(`${DIR}index.js`, 'utf8');
  const names = {
    'empty-state.jsx': 'EmptyState',
    'loading-block.jsx': 'LoadingBlock',
    'tabs.jsx': 'Tabs',
  };
  /* ALL THREE HAVE NOW GRADUATED (2026-09-08), and the assertion that OUTLIVES a
     migration is this one: the whole promise of the seam is that finishing one touches
     the barrel and not the thirty screens that import the name. Kept after PROVISIONAL
     emptied, for the same reason Badge's line below was kept. */
  for (const [, name] of Object.entries(names)) {
    assert.match(barrel, new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`, 'm'), `${name} must stay exported from the barrel`);
  }
  /* AND THE ONE THAT GRADUATED. `badge.jsx` was in the map above until 2026-09-07,
     when it moved onto the generated component and its legacy rules were deleted. The
     export assertion is the half that OUTLIVES a migration — the whole promise of this
     seam is that finishing one touches this file and not the thirty screens that import
     the name — so it is kept here rather than deleted with the provisional entry. */
  assert.match(barrel, /Badge/, 'Badge must stay exported after leaving PROVISIONAL');
});

/* ===== The second axis: design sign-off =====
 *
 * The tests above ask "is it still on legacy CSS" — a TECHNICAL question, derivable
 * from source. They are not enough on their own, and menu.jsx is the proof: it is on
 * the generated dropdown, renders no legacy class, passes every check above, and the
 * owner does not like how it looks. It had reached 30 screens before anyone said so.
 *
 * So a primitive carries a second, independent status: has the owner signed off its
 * APPEARANCE. Unlike the first, this one cannot be derived — CI can keep the list
 * complete and in sync, but it cannot detect that someone dislikes something. What it
 * can do is make approval EXPLICIT and DELIBERATE, so a component can never become
 * approved by drifting into wide use.
 *
 * Default is unreviewed. §1 step 1 stops only on a primitive that is BOTH migrated and
 * approved; an unreviewed one may stay in the screens that already use it, but a
 * REDESIGNED screen may not adopt it.
 */

const APPROVED = new Set([
  // Visible on the locked dashboard. The owner signed that page off and
  // DESIGN-LANGUAGE was written from it (ruling 2026-09-06). The line is deliberately
  // "what you could actually SEE on that page" — which is why the overlays are not
  // here. You do not scrutinise a menu that is usually closed.
  'rail.jsx', 'topbar.jsx', 'brief.jsx', 'kpi.jsx', 'account.jsx',
  'panel.jsx', 'calendar.jsx', 'card.jsx', 'button.jsx', 'page-entrance.jsx',

  /* THE FIRST ONE ADDED BY AN ACTUAL REVIEW (2026-09-07), rather than inherited from
   * the dashboard being signed off. Reviewed side by side against preset b2qLMFPP6 on
   * the Test page. It is also the primitive that made this whole mechanism necessary —
   * it had reached 30 screens, second only to wizard.jsx, while nobody had said whether
   * they liked it. This entry is what "the queue drains" looks like. */
  'menu.jsx',

  /* AND THE REST OF BATCH 1, PLUS THREE FROM THE VARIANT MATRIX (owner, 2026-09-07).
   *
   * The overlays were held back from the dashboard inheritance above on the grounds that
   * "you do not scrutinise a menu that is usually closed". They have now been scrutinised
   * — each one beside the registry component with none of our layer applied, which is
   * what the Test page's registry-vs-ours panes exist for — so the reason for holding
   * them no longer applies. `dialog.jsx` is approved as the layer UNDERNEATH `modal.jsx`:
   * every one of the app's modals is a Modal and Modal is built on Dialog, so approving
   * the Modal is approving what Dialog renders. It has no separate appearance to judge.
   *
   * The last three came from the variant matrix, where the owner exercised the states
   * rather than looked at a still: `badge.jsx` on its first render off legacy and on the
   * preset's own custom-colour recipe, `switch.jsx` with its off half rebuilt against the
   * preset's track, and `toggle-group.jsx` which the preset audit deliberately left
   * alone. */
  'modal.jsx', 'popover.jsx', 'dialog.jsx',
  'badge.jsx', 'switch.jsx', 'toggle-group.jsx',

  /* BATCH 2 — FORM CONTROLS, locked as a family (owner, 2026-09-07).
   *
   * Seven, not the eight the plan first listed: `switch` had already come through the
   * variant matrix, because an on/off control is one of the things you cannot judge from
   * a still.
   *
   * WHAT THE REVIEW ACTUALLY CHANGED, since "the owner looked and said yes" undersells it
   * badly here. Four of the seven are pass-throughs and were byte-identical to the
   * registry, so there was nothing of ours to approve; the review's whole yield was in
   * the two that were not. The picker alone produced: a row that had silently fallen
   * behind two responsive steps and rendered its value 14px closed and 16px open; a list
   * that dropped below the field because this wrapper had overridden the library default
   * on its own judgement; a tick in a reserved leading column that shoved every label
   * ~24px right as the list opened; and finally the discovery that the registry had
   * REWRITTEN the component into every one of those fixes, deleting ~150 lines of ours.
   *
   * The other three came from asking rather than deciding: labels moved to the muted
   * colour the dashboard had locked, the tick box came onto our radius scale, and a
   * question I had put to the owner turned out to be based on something I had got wrong
   * (the app already marked rejected fields; it was never only the sentence).
   *
   * `consent-field.jsx` is approved as a COMPOSITION of two of the others — a Checkbox
   * and a FieldLabel in a row — the same way `dialog.jsx` was approved under `modal.jsx`.
   * It originates no appearance of its own; what it fixes is a three-line consent
   * sentence being centred against a 16px box and rendered as bold as a heading. */
  /* `checkbox.jsx` LEFT THIS SET ON 2026-09-09, deliberately (owner), and it is STILL
   * @shadcn — it spent a few hours on @coss and the owner sent it back, because a coss
   * component arrives in our colours but in coss's geometry (twenty-one literals of
   * theirs against eight names our bridge owns). See primitives/checkbox.jsx.
   *
   * SO WHY UNREVIEWED, IF IT IS THE SAME REGISTRY IT WAS APPROVED ON. Because what
   * ships is not what was signed. Two things changed:
   *
   *   · the `rounded-sm` override is DELETED. That override is what destroyed the
   *     control — the ladder moved 6 -> 8 on 09-08 and radius clamps to half a 16px
   *     box, so every tick box in the app became a circle. It now takes the registry's
   *     own 5px, which makes it §6's one documented exception rather than a value of
   *     ours. `radius-clamp.test.js` is the guard that was missing.
   *   · it has a THIRD STATE it has never had. shadcn ships no indeterminate state, so
   *     the dash is absorbed in the wrapper — the trade log's select-all has to tell
   *     "all four hundred" from "nine of four hundred".
   *
   * A corner that changed and a state that did not exist are not things approval can be
   * inherited across. It rejoins Batch 2 when the owner signs it. */
  'input.jsx', 'textarea.js', 'select.jsx',
  'label.jsx', 'field.jsx', 'consent-field.jsx',

  /* BATCH 3 — FEEDBACK, locked as a family (owner, 2026-09-08).
   *
   * The cleanest batch of the review, and the reason is the process rather than luck: it
   * was audited under the standing rule that the REGISTRY is checked before anything is
   * wrapped or hand-built. All four were the shipped component and all four were
   * byte-identical to what their registry serves — no drift, no rewrite waiting, nothing
   * of ours to defend. `alert` and `progress` are @coss, `skeleton` and `spinner` are
   * shadcn base-rhea.
   *
   * `alert` IS @coss DELIBERATELY: shadcn ships two variants and §17 needs a four-step
   * ladder, which coss provides. §1 build order, not a shortcut past it.
   *
   * WHAT THE REVIEW CHANGED. One thing, and it was the owner seeing the four tones side
   * by side: "too colorful (doesn't go with our theme)". The surface wash came off every
   * tone and the edge went 32% -> 20%, because at 32% a tone edge composited BRIGHTER
   * than the loudest neutral edge in the app (#5d2c2f against a chip at #2d2d31). §17 was
   * tuned, not reversed — the glyph keeps full strength and the words stay neutral, which
   * is the half of the rule that separates a message bar from a losing figure in a table.
   *
   * `spinner.js` is approved WITH NO CALL SITES. Nothing in the app renders it; the owner
   * was told so on the page before signing. It is approved so that the first button that
   * needs one is not inventing it.
   *
   * AND ONE STALE TEST FELL OUT: a check that FORBADE the info and success tones on the
   * grounds their tokens did not exist. They had existed since §17 landed them on
   * 2026-09-06, and the test failed the first page that used them correctly. A stale test
   * is worse than a stale comment because it enforces. */
  'alert.jsx', 'skeleton.jsx', 'spinner.js', 'progress.jsx',

  /* AND THE ONE THAT WAS IN NO BATCH (owner, 2026-09-08).
   *
   * `overlay-container.js` renders NOTHING — it is a React context holding a ref, and
   * the batches were drawn from things you can look at, so it was never assigned to one.
   * That left the arithmetic short: 28 approved plus 7 batched is 35, and there are 36.
   *
   * APPROVED THE WAY `dialog.jsx` WAS, which is to say by confirming it WORKS rather
   * than by approving how it looks. It has exactly one visible consequence and the Test
   * page shows it: a menu opened inside a modal, which without this context portals
   * beside the backdrop and paints under the scrim — focused, keyboard-operable and
   * invisible. The owner opened it and the menu appeared.
   *
   * The PICKER in that same specimen is still broken and that is a KNOWN, PARKED
   * limitation rather than a defect in this file: the generated SelectContent exposes no
   * way to pass a portal container. Owner ruling 2026-09-08 was to leave and note it. */
  'overlay-container.js',

  /* BATCH 5 — SMALL PIECES, locked as a family (owner, 2026-09-08).
   *
   * A glance each, and all three byte-identical to base-rhea — so the only things of
   * ours in the batch were two locked-rule corrections already recorded on the count
   * badge (§5 puts a pill on --r-full; §4 keeps a filter count grayscale).
   *
   * BOTH FINDINGS WERE IN THE REVIEW APPARATUS AGAIN, which is now four times out of
   * five batches. The count badge "felt off on hover" because the SPECIMEN put it beside
   * the bell as a sibling rather than inside it, so moving the pointer onto the badge
   * left the button and dropped its hover fill — the app has never composed it that way.
   * And the divider was drawing `bg-border`, which on a card is A CARD'S EDGE (#1b1b1e),
   * where §4's ramp names `--line-strong` (#29292c) as "THE standard visible border —
   * dashed empties, SEPARATORS". That one was a real component fix, and it was a
   * correction to the ramp's own intent rather than a value chosen by eye. */
  'avatar.js', 'separator.jsx', 'count-badge.jsx',

  /* BATCH 6 — REBUILT, THEN REVIEWED, locked as a family (owner, 2026-09-08).
   *
   * The only batch that could not be looked at until it was BUILT. All three still
   * rendered the app's own `.u-*` markup, which was scheduled for deletion — so
   * reviewing them would have been reviewing something about to be thrown away. They
   * were rebuilt the same day and the owner reviewed the rebuild:
   *
   *     EmptyState   -> @shadcn/empty
   *     Tabs         -> @shadcn/tabs, variant="line"
   *     LoadingBlock -> the Skeleton primitive locked in Batch 3
   *
   * TWENTY-SIX LEGACY RULES WENT WITH THEM, which is half the point of the batch:
   * legacy/app.css is at 994 class names and its shared `u-*` layer is down to the
   * button, the card and the form field. PROVISIONAL above is empty as a result — the
   * resting state that map was built to reach.
   *
   * TWO OF THE THREE WERE HELD BACK BY REASONS THAT HAD EXPIRED, the fifth and sixth
   * found during this review. `empty-state.jsx` argued "no registry has an empty state"
   * on the line below its own status block naming the component that replaced it;
   * `tabs.jsx` argued its underline was too particular for a library, and the library
   * ships that underline as a variant. Only LoadingBlock's argument was live, and it is
   * answered in its header rather than deleted — the rebuild trades a sweeping shimmer
   * for a pulse, deliberately. */
  'empty-state.jsx', 'loading-block.jsx', 'tabs.jsx',
]);

const modules = files.filter((f) => f !== 'index.js');

test('every primitive declares exactly one design-review status', () => {
  for (const f of modules) {
    const tags = sources.get(f).match(/@design (approved|unreviewed)/g) ?? [];
    assert.equal(
      tags.length, 1,
      `${f} declares ${tags.length} @design tags; it must declare exactly one`,
    );
  }
});

test('the approved set is exactly the declared one — approval is never inferred', () => {
  const declared = modules
    .filter((f) => /@design approved/.test(sources.get(f)))
    .sort();
  assert.deepEqual(
    declared, [...APPROVED].sort(),
    'A primitive gained or lost owner approval. Approval is an OWNER decision, not a '
      + 'consequence of a component being widely used or of it passing the legacy-CSS '
      + 'check — menu.jsx passed that check at 30 screens and was still unwanted.',
  );
});

test('an approved primitive carries the date it was approved', () => {
  // "Approved" with no date is a claim nobody can check later.
  for (const f of APPROVED) {
    assert.match(
      sources.get(f), /@design approved \d{4}-\d{2}-\d{2}/,
      `${f} claims approval without saying when`,
    );
  }
});

/* A LOCKED BATCH IS A SET, AND IT FAILS AS A SET (owner locked Batch 1, 2026-09-07).
 *
 * `APPROVED` above already pins every individual file, so this looks redundant until one
 * of them regresses: that test fails with "a primitive gained or lost owner approval",
 * which does not say that the thing you just broke was signed off as a FAMILY. The whole
 * argument for reviewing in batches (PRIMITIVE-REVIEW-PLAN §5) is that these four have to
 * agree with each other — a menu, a popover, a dialog and a modal share a radius, an
 * elevation and an edge treatment, and unpicking one re-opens the other three.
 *
 * So the failure message names the lock. Add a batch here when the owner locks it; do not
 * add one because its members happen to all be approved. */
const LOCKED_BATCHES = {
  'Batch 1 — Overlays (locked 2026-09-07)':
    ['menu.jsx', 'modal.jsx', 'popover.jsx', 'dialog.jsx'],
  /* SIX, NOT SEVEN, SINCE 2026-09-09. `checkbox.jsx` was unlocked from this batch on
   * purpose: it is a different component now (@shadcn -> @coss, for the indeterminate
   * state) and the owner has not seen the replacement.
   *
   * WHY UNLOCKING ONE DOES NOT UNLOCK THE FAMILY HERE, which is the question this map
   * exists to force. Batch 2 was locked as a set because these controls "share a
   * height, a corner and a text size". The tick box shares the height and the text
   * size and is unchanged in both. It does NOT share the corner and now cannot: a
   * 16px box clamps any radius to 8px, so the ladder's smallest step draws a circle,
   * and the tick box is the app's one documented exception to §6 (see checkbox.jsx and
   * radius-clamp.test.js). The corner is the only axis it moved on, and it was never
   * on the family's axis to begin with. `consent-field.jsx` renders one and stays
   * approved for the same reason — what it originates is the row, not the box. */
  'Batch 2 — Form controls (locked 2026-09-07, checkbox unlocked 09-09)':
    ['input.jsx', 'textarea.js', 'select.jsx',
      'label.jsx', 'field.jsx', 'consent-field.jsx'],
  'Batch 3 — Feedback (locked 2026-09-08)':
    ['alert.jsx', 'skeleton.jsx', 'spinner.js', 'progress.jsx'],
  'Batch 5 — Small pieces (locked 2026-09-08)':
    ['avatar.js', 'separator.jsx', 'count-badge.jsx'],
  'Batch 6 — Rebuilt, then reviewed (locked 2026-09-08)':
    ['empty-state.jsx', 'loading-block.jsx', 'tabs.jsx'],
};

test('a locked batch stays locked, as a set', () => {
  for (const [batch, members] of Object.entries(LOCKED_BATCHES)) {
    for (const f of members) {
      assert.ok(
        APPROVED.has(f),
        `${f} left the approved set, but it is part of ${batch}. That batch was signed `
          + 'off as a family — the four overlays share a radius, an elevation and an edge '
          + 'treatment, so re-opening one re-opens all of them. Unlock the batch '
          + 'deliberately or restore the approval.',
      );
      assert.match(
        sources.get(f), /@design approved \d{4}-\d{2}-\d{2}/,
        `${f} is in ${batch} but no longer carries its approval date`,
      );
    }
  }
});

test('nothing provisional is also approved', () => {
  // Signing off the appearance of something still rendering legacy markup would be
  // signing off the thing that is about to be replaced.
  for (const f of Object.keys(PROVISIONAL)) {
    assert.ok(
      !APPROVED.has(f),
      `${f} is both provisional and approved — it cannot be both`,
    );
  }
});
