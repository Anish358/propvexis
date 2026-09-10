/* filter-chip.jsx
 *
 * @design approved 2026-09-10 — 🔒 Cycle 00, piece 3, with `command.jsx`. Signed off on
 *   the Test page after three rounds on the chip's shape: two segments rather than
 *   Linear's three, a `rounded-2xl` that clamps to a pill at 24px, and `--line-chip` for
 *   an edge that only ever sits on a popover. It is the cycle's first HAND-WRITTEN part
 *   and §1 requires the argument to stay in this file — it is below, and a test asserts
 *   it is still here. A redesigned screen may adopt it.
 *   See test/primitives-status.test.js.
 */

import React from 'react';
import { Plus, X } from 'lucide-react';
import { PRESS, PRESS_MOTION } from './motion.js';

/* FilterChip — an APPLIED filter, as a removable token.
 *
 *     [ ⚑ Session │ is any of │ London, New York │ × ]
 *
 * ── TWO SEGMENTS, AFTER A ROUND TRIP THROUGH THREE (owner, 2026-09-09) ──────────────
 *
 * The chip started as `Session: London, New York ×`. The owner rejected it against
 * Linear's filter bar, which spells the whole sentence — FIELD, OPERATOR, VALUE — so it
 * was rebuilt with an operator segment ("is any of") divided out of the middle. The owner
 * looked at that and asked for two segments back.
 *
 * KEPT FROM THE THREE-SEGMENT VERSION, because none of it was the operator's doing: the
 * hairline that divides field from value, the leading icon, the fixed 24px height, the
 * `--line-chip` edge, and the fact that only the VALUE is a control. What went is the
 * middle word.
 *
 * AND THE PROP WENT WITH IT. `operator` was rendered conditionally, so leaving it would
 * have cost nothing and "worked" — which is exactly why it is gone. A switch that outlives
 * the question it was added for is how one component ends up able to look like two, and
 * this library has now removed the same shape twice (the tooltip's `surface`). If the
 * operator comes back it comes back as a decision, not as an option someone finds.
 *
 * ── WHAT LINEAR DOES THAT THIS DELIBERATELY DOES NOT ─────────────────────────────────
 *
 * §2: never build a control the product cannot honour. Two things in the reference are
 * affordances we do not have, and drawing them would be drawing a lie:
 *
 *   THE FIELD IS NOT CLICKABLE. Linear lets you swap "Assignee" for "Creator" in place.
 *   Ours has no such flow: you remove the chip and add another. Only the VALUE is a button
 *   — which is exactly what our panel already does when a chip is clicked, so the behaviour
 *   is unchanged and only the hit area got honest.
 *
 *   THERE IS NO "SAVE". Linear saves a filter set as a view. We have no saved views, no
 *   endpoint for them and no route. A Save button would be a control with nothing behind
 *   it. This one has not moved and will not until the feature exists.
 *
 *   `Clear` IS IN THE ROW NOW (owner, 2026-09-09), and it was not. This note used to argue
 *   that Clear already lives in the panel's head and moving it was a screen change rather
 *   than a kit one. The owner asked for it at the end of the strip, with a count beside it.
 *   That is their call and it is a good one: the row is where you can see what the filters
 *   did, so it is where you would undo them. The KIT only gains the parts — where the
 *   panel puts them is still the panel's decision at migration time, and the head's
 *   existing Clear should go rather than become a second one.
 *
 * ── §1 STEP 4: STILL HAND-WRITTEN, AND STILL FOR THE SAME REASON ─────────────────────
 *
 * All three earlier steps were run again for this shape and none of them ships it.
 * @shadcn has no chip at all — searched "chip", "tag", "token", "removable"; its nearest
 * object is Badge, a `span` with no interaction. @coss has chips only INSIDE whole
 * comboboxes (`p-combobox-19`, `p-combobox-20`), and a coss block arrives in our colours
 * but in coss's geometry. And composing from Badge + Button is the wrong shape twice over
 * now: what makes this read as ONE token is a shared border with hairlines between four
 * segments and a single radius clipping all of them. That is a container, and it is more
 * of one than it was — the old two-part chip was at least arguably a Badge with a button
 * stuck on the end.
 *
 * IT ORIGINATES NO VALUES. Every colour and size below is a token or a utility resolving
 * to one — `filter-chip` has no hex and no pixel literal in it, and a test asserts that,
 * because this is the one file in the library with no preset underneath it to inherit from.
 */

/* THE ROW. `flex-wrap`, because the number of applied filters is not bounded — thirty are
 * registered — and a chip row that scrolls sideways hides the thing it exists to show. */
function FilterChips({ className, ...rest }) {
  return (
    <div
      data-slot="filter-chips"
      className={['flex flex-wrap items-center gap-1.5', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

/* `items-stretch` so each hairline runs the full height of the chip rather than floating
 * in the middle of it; `overflow-hidden` so the shared radius clips every segment's hover
 * fill. Those two are what make four parts read as one object. */
/* ── THE EDGE, AND WHY A BARE `border` WAS BRIGHT WHITE (owner, 2026-09-09) ───────────
 *
 * This read `border` with no colour, and the owner said the borders were too bright. They
 * were: **in Tailwind v4 a bare `border` sets WIDTH AND STYLE ONLY**, and the colour falls
 * back to CSS's initial value, which is `currentColor` — the chip's own text. So the edge
 * was painting #fafafa. It is not a Preflight gap (v4's preflight sets no border colour
 * either, by design); it is v4's documented change from v3's grey default, and it bites
 * only HAND-WRITTEN components, because every generated one pairs `border` with an
 * explicit `border-*` colour. This is the only hand-written primitive in the library.
 *
 * `--line-chip` IS THE TOKEN FOR THIS EXACT OBJECT: tokens.css calls it "a chip's edge on
 * a filled ground; a count badge's". It is deliberately NOT the contextual `--chrome-line`,
 * and the reason is worth keeping — a contextual edge resolves against the surface the
 * element sits ON, and a chip carries its own filled ground (`--sel-bg`). Its edge is
 * relative to ITSELF, so it is the same value in a card and in a panel, and a fixed token
 * is the correct kind of token here rather than a missed opportunity.
 *
 * THE DIVIDERS ARE THAT EDGE AT 50%, which is §8: "a divider inside a surface that already
 * has an edge is HALF that edge, so it reads as a division rather than a second border" —
 * and it is the same idiom the generated `DropdownMenuSeparator` uses (`bg-border/50`).
 *
 * `rounded-2xl` AND NOT `rounded-md` (owner, 2026-09-09: "Everything like the preset").
 * This is the one component with no registry equivalent to inherit a corner from, so it
 * takes the corner of the thing it most resembles: `@shadcn/badge` asks for `rounded-2xl`,
 * the preset's control step. At 24px tall that is past half and clamps to 12 — a pill, the
 * same way a badge is. It was 8px, which was a step of our own choosing and the last radius
 * in the library not coming from the preset. */
const SHELL = [
  'group/chip inline-flex h-6 max-w-full items-stretch overflow-hidden',
  'rounded-2xl border border-[var(--line-chip)] bg-[var(--sel-bg)] text-xs',
  'has-[:focus-visible]:border-ring',
].join(' ');

/* EDITING IS A STATE, NOT A SELECTION. While its value column is open the chip is the
 * thing that column belongs to, so it INTENSIFIES what it already wears (§14) rather than
 * introducing anything new: the fill steps from --sel-bg (#1e1e21) to --sel-bg-strong
 * (#29292c), which is +11 and unmistakable.
 *
 * THE EDGE IS DELIBERATELY NOT TOUCHED, and the first draft got this backwards. It read
 * `border-line-strong`, which is #29292c — DIMMER than the resting --line-chip (#2d2d31),
 * so "editing" dimmed the edge instead of strengthening it. Worse, --line-strong and
 * --sel-bg-strong are the SAME value, so the border disappeared into its own fill at
 * exactly the moment the chip was active. --line-chip is the top of the edge ramp; there
 * is no brighter neutral to step to, and reaching for the brand ring would be introducing
 * a colour rather than intensifying one. The fill carries the state on its own. */
const EDITING = 'bg-[var(--sel-bg-strong)]';

/* Every segment after the first carries the hairline that divides it from the one before —
 * the chip's own edge at 50%, per §8. See the note above. */
const SEG = 'flex items-center gap-1.5 px-2';
const DIVIDED = 'border-l border-l-[var(--line-chip)]/50';

function FilterChip({
  icon, field, value, editing = false, onEdit, onRemove, className, ...rest
}) {
  return (
    <span
      data-slot="filter-chip"
      data-editing={editing || undefined}
      className={[SHELL, editing && EDITING, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {/* THE FIELD — static, and the QUIET half now that the operator is gone. With three
          segments the operator carried the contrast; with two, the field has to, or the
          chip reads as two equal words. This is the same label/figure split the dashboard
          uses for every pair. `[&>svg]:size-3` keeps a caller's icon to the chip's scale
          without the caller having to size it, which is the kind of thing that drifts. */}
      <span className={[SEG, 'flex-none text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70'].join(' ')}>
        {icon}
        {field}
      </span>

      {/* THE VALUE — the only part that is a control, because opening the value column is
          the only thing a chip can do besides being removed. */}
      <button
        type="button"
        onClick={onEdit}
        aria-expanded={editing}
        title={`Edit ${field} filter`}
        className={[
          SEG, DIVIDED,
          'min-w-0 cursor-pointer bg-transparent text-foreground',
          'hover:bg-muted focus-visible:outline-none',
          /* The value segment OPENS the cascade, and a trigger presses now (§10, owner
             2026-09-11). PRESS_MOTION also replaces no transition at all — this chip
             had none, so its hover was an instant colour swap. */
          PRESS_MOTION, PRESS,
        ].join(' ')}
      >
        <span className="truncate">{value}</span>
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${field} filter`}
        className={[
          DIVIDED,
          'grid w-6 flex-none place-items-center cursor-pointer bg-transparent',
          'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none',
        /* The ✕ does NOT press: it is flush inside a divided chip, where moving one
           segment 1px breaks the seam it shares with the other two. It takes the
           transition so its hover eases like its neighbour's. */
        PRESS_MOTION,
        ].join(' ')}
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </span>
  );
}

/* THE ADD BUTTON that closes the row. Real: the panel already has an "Add filter" row and
 * this is the same action, so it is an affordance the product honours (§2). Borderless,
 * like the reference — it is an invitation rather than an applied filter, and giving it a
 * chip's edge would make the row read as having one more filter than it has. */
function FilterChipAdd({ className, ...rest }) {
  return (
    <button
      type="button"
      data-slot="filter-chip-add"
      aria-label="Add a filter"
      className={[
        'grid h-6 w-6 place-items-center rounded-md cursor-pointer bg-transparent',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        /* Add opens a menu — a trigger, so it presses (§10). */
        PRESS_MOTION, PRESS,
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      <Plus aria-hidden="true" className="size-3.5" />
    </button>
  );
}

/* THE TAIL — what the filters DID, and the way out of them.
 *
 * `ml-auto` pushes it to the far end of the strip, which is where the reference puts it and
 * where it belongs: you read the chips left to right, and the last thing you want is the
 * damage report and an undo. It survives `flex-wrap` — on a row that wraps, the tail sits
 * at the end of the LAST line rather than being orphaned.
 *
 * WHY IT IS A SEPARATE PART rather than props on FilterChips: the tail is not a chip, it
 * must not wrap INTO the chip flow, and a caller may legitimately want the row without it
 * (a read-only view of someone's saved filters, when that exists). */
function FilterChipsTail({ className, ...rest }) {
  return (
    <div
      data-slot="filter-chips-tail"
      className={['ml-auto flex items-center gap-2', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

/* THE COUNT — "38 of 412 trades".
 *
 * BOTH NUMBERS ARE REAL AND ALREADY IN ONE PLACE. `App.jsx` computes
 * `filterTrades(normalizedTrades, …)`, so the filtered length and the unfiltered length sit
 * on adjacent lines; the Trade Log already prints the first as `.log-count`. So this adds a
 * readout, not a number nobody has.
 *
 * "OF" APPEARS ONLY WHEN THE FILTERS ACTUALLY NARROWED SOMETHING. With nothing applied it
 * reads "412 trades", which is exactly what ships today — never "412 of 412", which is a
 * sentence that makes a reader look for the filter they have not set. That is a rule rather
 * than an option: `total` omitted and `total === shown` render the same thing on purpose.
 *
 * `tabular-nums` because these are figures in a place the eye returns to as the filters
 * change, and digits that shift width make the row twitch. */
function FilterCount({ shown, total, noun = 'trades', className, ...rest }) {
  const narrowed = total != null && total !== shown;
  return (
    <span
      data-slot="filter-count"
      className={['text-xs tabular-nums text-muted-foreground', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {narrowed ? `${shown} of ${total} ${noun}` : `${total ?? shown} ${noun}`}
    </span>
  );
}

export { FilterChip, FilterChipAdd, FilterChips, FilterChipsTail, FilterCount };
