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
  /* `checkbox.jsx` LEFT THIS SET ON 2026-09-09 AND REJOINED IT THE SAME DAY, and the
   * round trip is worth keeping because it is what §1's "approval is never inferred"
   * costs in practice. It is STILL @shadcn — it spent a few hours on @coss and the owner
   * sent it back, because a coss component arrives in our colours but in coss's geometry
   * (twenty-one literals of theirs against eight names our bridge owns).
   *
   * WHY IT HAD TO GO BACK AT ALL, when it was the same registry it was approved on:
   * what shipped was not what was signed. Two things had changed.
   *
   *   · the `rounded-sm` override was DELETED. That override is what destroyed the
   *     control — the ladder moved 6 -> 8 on 09-08 and radius clamps to half a 16px
   *     box, so every tick box in the app became a circle. It now takes the registry's
   *     own 5px, which makes it §6's one documented exception rather than a value of
   *     ours. `radius-clamp.test.js` is the guard that was missing.
   *   · it has a THIRD STATE it never had. shadcn ships no indeterminate state, so the
   *     dash is absorbed in the wrapper — the trade log's select-all has to tell
   *     "all four hundred" from "nine of four hundred".
   *
   * The owner signed both on 09-09 and it is back in Batch 2 below. A corner that changed
   * and a state that did not exist are not things approval can be inherited across, and
   * the fact that the answer was "yes, both are right" does not make the asking wasted. */
  'input.jsx', 'textarea.js', 'select.jsx',
  'label.jsx', 'field.jsx', 'consent-field.jsx', 'checkbox.jsx',

  /* CYCLE 00, PIECE 1 — THE DATA TABLE, locked 2026-09-09 (owner).
   *
   * THE FIRST ENTRY HERE THAT IS NOT A PRIMITIVE-REVIEW BATCH, and the distinction is
   * real: the batches signed off parts the app ALREADY had, and this is the first part
   * the kit built from nothing. There was no data table in this codebase — twelve files
   * hand-rolled a `<table>` — so there was no existing appearance for it to inherit and
   * no legacy rule to delete. It was reviewed on the Test page rather than as a mockup,
   * by the owner's own ruling, because a drawing cannot show a bridge re-meaning a name
   * or a sticky header that a scroll container silently kills, and both happened here.
   *
   * FOUR CORRECTIONS LANDED IN THE ONE DAY IT WAS OPEN, and all four came from the owner
   * looking at the real thing: thirteen columns rather than fifteen (fifteen overflows a
   * page the real one never does), per-column widths rather than `table-fixed`'s even
   * split, results right-aligned while measurements stay centred, and a footer that can
   * total. Sorting was closed as permanently part of the component rather than a flag.
   *
   * WHAT IT DOES NOT YET DO, on purpose: the adherence cell still carries its reason on
   * a `title=` attribute. That is a tooltip, the tooltip is Cycle 00's piece 2, and it
   * moves the day the tooltip is signed — not before, because this file is now locked
   * and that is a change to how it looks. `kit-tooltip.test.js` holds the sequencing. */
  'data-table.jsx',

  /* CYCLE 00, PIECE 2 — THE TOOLTIP, locked 2026-09-09 (owner).
   *
   * A FOURTH SITUATION THE CYCLE 00 AUDIT DID NOT HAVE A ROW FOR. `ui/tooltip.jsx` had
   * been installed the whole time — it arrived as a dependency of `sidebar` — so the audit
   * filed it under "already real" and moved on. Nobody checked whether the APP could reach
   * it: it had never been wrapped, exported or looked at, and the one thing the data
   * table's spec asked for and did not deliver ("adherence cells carry a reason on hover")
   * was still a `title=` attribute. Installed is not the same as usable.
   *
   * THREE RULINGS, AND TWO OF THEM REVERSED WHAT WAS BUILT, which is what a review is for:
   *
   *   · COLOUR — ours. shadcn draws a tooltip as the negative of the page, and our bridge
   *     maps --color-foreground to --text, so the identical two utilities produce a
   *     near-white slab here. The owner kept the panel, which is what §4 and --surface-2's
   *     own comment already said. The `surface` prop that existed so both could be
   *     compared was DELETED on the ruling — a switch outliving its question is how one
   *     overlay ends up disagreeing with the other four.
   *   · CORNER — the REGISTRY's, against a defensible argument for ours. At 28px tall the
   *     registry's 14px clamps to a full stadium, and the owner chose that knowing it.
   *     The wrapper therefore declares NO radius: restating the value is what lets it
   *     drift away from "like the registry" later.
   *   · DELAY — 100ms, cut from the 600 the build had restored as Base UI's own default.
   *
   * Two of `kit-tooltip.test.js`'s assertions had to reverse with them. A test that
   * encodes a decision moves with the decision or it enforces a stale one — the same
   * failure this file records under the tone check that outlived its reason. */
  'tooltip.jsx',

  /* CYCLE 00, PIECE 3 — THE FILTER BUILDER, locked 2026-09-10 (owner).
   *
   * TWO PARTS WITH OPPOSITE ORIGINS, AND THE CONTRAST IS THE FINDING.
   *
   *   · `command.jsx` is the registry's, and what is remarkable is how LITTLE was wrong.
   *     Every kit piece before this needed a real correction; this one arrived on our
   *     values almost exactly, because `menu.jsx` settled the same vocabulary on 09-07
   *     and a command row and a menu row are the same object — row radius, row text and
   *     row hover all matched already. The wrapper adds ONE attribute,
   *     `data-overlay-surface`, without which every row hovers to a CARD's hover inside
   *     a panel: the seventh instance of that fault. `CommandDialog` is deliberately not
   *     wrapped — there is no ⌘K in this product and §2 forbids drawing one.
   *
   *   · `filter-chip.jsx` is HAND-WRITTEN, the first in Cycle 00, which §1 allows only
   *     as the last step and only with the argument in the file. All three earlier steps
   *     were run for real: @shadcn has no chip (its nearest object is Badge, a `span`),
   *     @coss has them only inside whole comboboxes and in coss's geometry, and
   *     Badge + Button is the WRONG SHAPE — a chip looks like one pill and behaves like
   *     two controls, and what makes it read as one token is a shared border with a
   *     divider and a single radius clipping both halves. That is a container.
   *
   * THE HAND-WRITTEN ONE IS WHY THIS ENTRY MATTERS MORE THAN THE OTHERS. Everything else
   * in this set is the registry's work with our values on it, and a bad decision there is
   * bounded by what the registry ships. This one is ours end to end, so §1's escape hatch
   * is asserted by `kit-filter-bar.test.js` rather than merely written down: the argument
   * must still be IN the file, every colour must still be a token, and the chip must not
   * grow the affordances the product cannot honour.
   *
   * TWO BUGS IN THE SHIPPED CHIP WERE FIXED ON THE WAY, both bugs rather than taste: its
   * text was 11px and therefore not on the type scale at all (the 09-07 scale move never
   * reached the file), and its border was hard-coded to `--line` — A CARD'S EDGE, on a
   * component that only ever appears inside a popover, which is why the chips have always
   * looked edgeless in the real panel.
   *
   * AND THE `operator` PROP WAS DELETED RATHER THAN LEFT CONDITIONAL when the owner ruled
   * the chip back to two segments. It rendered conditionally, so keeping it would have
   * cost nothing and "worked" — which is exactly the reason it is gone. This library has
   * now removed the same shape twice; the tooltip's `surface` was the first. A switch
   * that outlives the question it was added for is how one component ends up able to
   * look like two.
   *
   * NOTHING IS MIGRATED, ON PURPOSE. `FilterPanel.jsx` still renders all 35 of its
   * `.fp-*` legacy classes and still ships; the panel moves in Cycle 01 with the Trade
   * Log, and that commit deletes those rules AND their names in
   * `test/fixtures/legacy-classes.txt` together. `kit-filter-bar.test.js` pins the
   * sequencing so signing these parts off cannot be mistaken for having migrated them. */
  'command.jsx', 'filter-chip.jsx',

  /* CYCLE 00, PIECE 4 — THE DETAIL DRAWER, locked 2026-09-10 (owner).
   *
   * THE SECOND COMPONENT `@shadcn/sidebar` INSTALLED WITHOUT ANYONE NOTICING. `ui/sheet.jsx`
   * arrived as a registry dependency, exactly as `ui/tooltip.jsx` did, and the audit filed
   * both under "already installed" and therefore "nothing to do" without asking whether the
   * app could reach them. Nothing imported it but `ui/sidebar.jsx`, privately, for the
   * mobile rail. Two of this cycle's six pieces came in that one box, and the cause is
   * general enough to expect again: a dependency is precisely the thing an audit counts as
   * present without checking who can use it.
   *
   * TWO RULINGS, AND THE FIRST WENT AGAINST THE REGISTRY *AND* AGAINST A TOKEN'S OWN
   * DESCRIPTION OF ITSELF:
   *
   *   · SURFACE — the CARD colour (--surface), not the floating-panel one. The registry
   *     draws `bg-popover`, and `--surface-2` documents itself as "EVERY FLOATING PANEL —
   *     menu, popover, select, combobox". That list turned out to DESCRIBE the things that
   *     had needed it rather than DEFINE what qualifies: every previous holder is small and
   *     transient, and this one is 480px wide, full height, and holds a card, twenty fields
   *     and a paragraph. A drawer is a place you go to read.
   *
   *     AND `data-overlay-surface` CAME OFF WITH IT, which is the half that matters and the
   *     one a future reader is most likely to "fix". These were never two questions: the
   *     same attribute that sets the panel's colour makes every hover, edge and separator
   *     INSIDE resolve to overlay values. Keeping it on a card-coloured surface produces
   *     the exact fault the attribute exists to prevent, inverted — and it would look
   *     almost right. The attribute is about COLOUR CONTEXT, not stacking: the drawer still
   *     portals, still takes a scrim, still traps focus, and an overlay opened inside it
   *     still declares its own. This is the one place in the library where those two
   *     readings of "is it an overlay" disagree.
   *
   *   · CLOSE CONTROL — an ✕ in the ACTIONS row, which is neither of the two obvious
   *     answers. Not the `‹` that ships to the left of the title, and not the registry's
   *     button floating at `top-4 right-4`. Closing is one of the things you can do to this
   *     record, so it sits beside Edit and Delete. `showCloseButton` stays forced off —
   *     the registry's is absolutely positioned and would land ON TOP of the chosen one.
   *
   * WHAT IS SIGNED IS THE SHELL. The owner noted on the same day that the drawer is being
   * REDESIGNED LATER. That does not reopen this: `sheet.jsx` contains the panel and nothing
   * else — width, surface, motion, edge, portal behaviour — and everything inside it on the
   * Test page is composed by the SPECIMEN, deliberately in the shipped structure (§2)
   * rather than as a proposal. A later redesign of what the drawer shows is a Cycle 01+
   * question about contents, and this component is not a reason that redesign has to keep
   * twenty fields in two columns.
   *
   * NOTHING IS MIGRATED. `TradePreview.jsx` still renders its 26 `.tp-*` classes and still
   * ships in the Trade Log AND the Day view — 187 hand-written lines with a click-handler
   * backdrop, a document-level Escape listener, a `role="dialog"` with no `aria-modal`, and
   * no focus trap or restore at all. The registry's dialog supplies every one of those for
   * free; none of it was what the owner judged. `kit-drawer.test.js` pins the sequencing. */
  'sheet.jsx',

  /* CYCLE 00, PIECE 5 — THE FORM SECTION, locked 2026-09-10 (owner).
   *
   * Three files, because the piece grew twice while it was open — the owner looked at the
   * rebuilt Add Trade form and asked for a searchable Symbol field, then for the calendar
   * to come from shadcn. Both were the same finding in different clothes: the form was
   * using BARE HTML INPUTS where the product needed controls, and a bare input's
   * affordances belong to the browser. `<input type="date">` was rendering Chrome's own
   * picker, in Chrome's colours, unreachable by any stylesheet we own.
   *
   * THE PIECE CORRECTED THE BRIEF THAT COMMISSIONED IT. §4.3 said "6 Settings sections,
   * Add Account, and a 10-step wizard"; the Settings half does not survive contact with
   * the screens, which are label/value ROWS — Profile is read-only on purpose, Plan is a
   * summary and a link, Appearance writes on change with no Save. The real call sites are
   * NINE MODALS plus the wizard steps and auth, and THAT is what found the legacy layer:
   * the form CSS in this app is not a `.form-*` family, it is bare element selectors
   * scoped to a dialog (`.modal input`, `.modal footer`, `.modal button.primary`,
   * `.field-row`). Which is exactly why `modal.jsx` had to KEEP the class `modal` when
   * the shell migrated in Phase 4b — nineteen content rules hang off it.
   *
   * ⚠⚠ THE BIGGEST FINDING OF THE CYCLE, AND IT IS ABOUT THE REGISTRY MOVING AWAY FROM US.
   * shadcn SHIPS the whole section anatomy (FieldSet, FieldLegend, FieldGroup,
   * FieldContent, FieldTitle, FieldSeparator), so the build order said take it. WE MUST
   * NOT. Its `field` has been rewritten since we installed ours: on disk is 78 lines on
   * `@base-ui/react/field`; the registry now serves 239 lines of plain markup with `cva`
   * and NO Base UI Field in it at all. Re-installing would delete the aria wiring
   * `field.jsx` was approved for, remove FieldControl/FieldValidity, and change
   * FieldError to an `errors`-prop component — which the account page's unique-name rule
   * was built against. `kit-form-section.test.js` is the tripwire. **This is the first
   * time step 2 of §1 produced the WRONG answer, and the reason is drift rather than
   * judgement.** The section came from `@coss/fieldset` instead: 33 lines on Base UI's
   * own Fieldset, the same family our Field is already on.
   *
   *   · `form-section.jsx` — FormSection (a real <fieldset>/<legend>, so the grouping is
   *     in the accessibility tree), FormGrid, FormWide, FormFooter. RULED: Save greys out
   *     until something changes. The prop default stays `true` deliberately — the ruling
   *     is a policy about forms, the default is about this API's failure mode, and
   *     `false` would ship a Save nobody can press when someone forgets the prop.
   *     The footer also closes `spinner.js`'s open item: approved 09-08 with NO call
   *     sites, "so that the first button that needs one is not inventing it". This is it.
   *
   *   · `combobox.jsx` — @shadcn/combobox, Base UI. RULED OPEN, and ⚠ OPEN IS WIRING, NOT
   *     A FLAG: Base UI keeps the selected item and the typed text in separate props, and
   *     text matching nothing selects nothing, so a combobox left alone is effectively a
   *     CLOSED list that never says so — identical to look at, and the typed text
   *     evaporates on submit. The owner was told it was already open; it was not. Values
   *     are the CLEAN symbols (XAUUSD), not the broker's, or gold on two prop firms
   *     becomes two instruments. Only Symbol takes one: a Select becomes a Combobox when
   *     the list outgrows the EYE, not when it outgrows the developer.
   *
   *   · `date-picker.jsx` — @shadcn/calendar in a Popover (`date-picker` is not a registry
   *     component; shadcn documents it as exactly that composition). ⚠ NOT `calendar.jsx`,
   *     which is the DASHBOARD's P&L heatmap and locked. Its trigger wears the FIELD
   *     surface rather than shadcn's `Button variant="outline"` — beside a filled Input,
   *     an outline button reads as an action — and copies SelectTrigger's recipe, with a
   *     test keeping the two in step because a copy is what drifts. It cost two new
   *     dependencies (react-day-picker, date-fns) in an app that had no date library.
   *
   * NOTHING IS MIGRATED. All nine modals still ship as they are; they move one at a time,
   * each deleting its own rules and their names in legacy-classes.txt in the same commit. */
  'combobox.jsx', 'date-picker.jsx', 'form-section.jsx',

  /* CYCLE 00, PIECE 6 — THE THREE STATES, locked 2026-09-10 (owner). The last piece.
   *
   * IT OWED ALMOST NO NEW APPEARANCE, AND THAT IS THE FINDING. Three of §15's four states
   * were already done and nobody had noticed: EmptyState and LoadingBlock (Batch 6),
   * Skeleton and Alert (Batch 3), and the DATA TABLE drew its own three states correctly
   * back in piece 1 — real rows at the real 37px, `aria-busy`, a label naming what is
   * loading, and a notice row that keeps the header rather than swapping the table for a
   * centred box. §15 itself is locked and already says which state appears when.
   *
   * WHAT WAS MISSING WAS COVERAGE. TWO route-level pages out of SEVENTY-FOUR render
   * anything when a fetch fails. The other seventy-two render nothing — a blank region,
   * or a skeleton that never resolves — and a trader on a dropped connection cannot tell
   * that apart from "you have no trades". So the reason there was exactly ONE call site
   * to migrate is not that failures are rare; it is that the app had nowhere to put them.
   * A test DERIVES the 2-of-74 figure from source so the specimen cannot go stale.
   *
   * AND THE ONE THAT EXISTED BROKE §17 TWICE: `.banner.error` colours its WORDS and
   * washes its SURFACE at 7%, where §17 permits the glyph and a border only and caps a
   * wash at 4%. The half that matters in this product is the second one — red is the
   * trader's money, so a screen washed in loss-red to report a timeout speaks the
   * language of a losing day about a network problem. `ErrorState` uses --warning and
   * never --loss, and a test forbids the loss token outright.
   *
   * IT IS A SIBLING OF `EmptyState`, NOT A VARIANT. §15: "an empty state is not an error
   * state." Both are built on the same generated `Empty` shell — identical by
   * construction — and separated by exactly three things: the empty state's edge is
   * DASHED (the idiom for a space waiting to be filled; a failure is not a placeholder),
   * the error's GLYPH is toned while its words are not, and the error OFFERS A WAY OUT.
   * A separate component rather than `<EmptyState tone="error">` because a prop is a
   * thing you have to know to reach for, and seventeen call sites already import the
   * part named for the opposite condition.
   *
   * THE BOUNDARY WITH `Alert` IS WHETHER THERE IS STILL A PAGE TO READ. Alert is a
   * message ON content; ErrorState REPLACES content that is not there. The data table
   * draws the line in the same place and a test keeps that worked example alive. */
  'error-state.jsx',

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
  /* SEVEN AGAIN SINCE 2026-09-09. `checkbox.jsx` was unlocked from this batch that
   * morning and re-signed the same day, so the batch is whole.
   *
   * WHY UNLOCKING ONE DID NOT UNLOCK THE FAMILY, which is the question this map exists
   * to force, and the answer is worth keeping now that the round trip is over. Batch 2
   * was locked as a set because these controls "share a height, a corner and a text
   * size". The tick box shares the height and the text size and was unchanged in both.
   * It does NOT share the corner and cannot: a 16px box clamps any radius to 8px, so the
   * ladder's smallest step draws a circle, and the tick box is the app's one documented
   * exception to §6 (see checkbox.jsx and radius-clamp.test.js). The corner was the only
   * axis it moved on, and it was never on the family's axis to begin with.
   * `consent-field.jsx` renders one and never left — what it originates is the row, not
   * the box. */
  'Batch 2 — Form controls (locked 2026-09-07, checkbox re-signed 09-09)':
    ['input.jsx', 'textarea.js', 'select.jsx',
      'label.jsx', 'field.jsx', 'consent-field.jsx', 'checkbox.jsx'],
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
