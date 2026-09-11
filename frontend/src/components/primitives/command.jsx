/* command.jsx
 *
 * @design approved 2026-09-10 — 🔒 Cycle 00, piece 3, with `filter-chip.jsx`. Signed off
 *   on the Test page. The finding here was how LITTLE was wrong: `menu.jsx` settled this
 *   vocabulary on 09-07 and the registry already agreed with it, so the wrapper adds one
 *   attribute and no classes. A redesigned screen may adopt it.
 *   See test/primitives-status.test.js.
 */

import React from 'react';
import {
  Command as UiCommand, CommandEmpty as UiCommandEmpty, CommandGroup as UiCommandGroup,
  CommandInput as UiCommandInput, CommandItem as UiCommandItem,
  CommandList as UiCommandList, CommandSeparator as UiCommandSeparator,
  CommandShortcut as UiCommandShortcut,
} from '@/components/ui/command';

/* Command — PropVexis primitive, on the GENERATED `@shadcn/command` (base-rhea, installed
 * 2026-09-09). A SEARCHABLE LIST OF PICKABLE THINGS, and in this app that is one thing:
 * the filter builder's value columns.
 *
 * ── THIS IS NOT A COMMAND PALETTE, AND THE NAME IS THE REGISTRY'S ────────────────────
 *
 * There is no ⌘K in this product and none is proposed. What Cycle 00 needs is the inside
 * of a cascade column: a search box, groups, rows that can be ticked, a count on the
 * right, and an empty state — which is exactly what this component is, minus the dialog.
 * `CommandDialog` is deliberately NOT re-exported below; wrapping it would put a palette
 * one import away from a product that has not asked for one.
 *
 * WHY IT IS A KIT PIECE AT ALL. `FilterPanel.jsx` hand-rolls all of that today across 35
 * `.fp-*` legacy classes — its own `<input className="fp-search">`, its own `role="listbox"`
 * with an `aria-activedescendant` cursor, its own group headings, its own "No matches".
 * That is ~200 lines of keyboard and ARIA work the registry ships, and it is the single
 * biggest block of legacy CSS left outside the Trade Log.
 *
 * ── HOW LITTLE THIS WRAPPER HAS TO DO, WHICH IS THE FINDING ──────────────────────────
 *
 * `menu.jsx` already settled this vocabulary on 2026-09-07 and the registry agrees with it
 * almost exactly. A command row and a menu row are the same object — a pickable line in a
 * floating panel — and they arrive on the same values:
 *
 *   ROW RADIUS   the registry's `rounded-xl`, which the bridge pins to 14px. That is what
 *                `menu.jsx` ITEM uses, deliberately and after an owner ruling (09-08: use
 *                the ladder, not typed numbers). Nothing to correct.
 *   ROW TEXT     `text-sm`, which our bridge re-means as `--fs-body` = 14px. `menu.jsx`
 *                spells the same size as `text-[14px]`. Same pixel, no correction.
 *   ROW HOVER    `data-selected:bg-muted`, and `--color-muted` points at `--chrome-hover`,
 *                which is CONTEXTUAL — see the surface note below. Correct once the panel
 *                declares itself.
 *
 * So this file is ONE ATTRIBUTE. That is the outcome §1 wants, and it is worth saying out
 * loud: the four previous kit pieces each needed a real correction, and this one needed
 * reading `menu.jsx` and then leaving the component alone. The one bug it did surface —
 * the search box's bright strip — turned out to belong to the BRIDGE and is fixed there
 * for every component, not here for this one.
 *
 * ── WHAT IT CORRECTS: ONE THING ──────────────────────────────────────────────────────
 *
 * `data-overlay-surface` ON THE SHELL, and that is the whole wrapper. Every rule above
 * that resolves chrome — `bg-muted` on a hovered row, `bg-border/50` on the separator —
 * reads `--chrome-*`, and those are contextual (tokens.css, "CHROME IS CONTEXTUAL").
 * Without the attribute a row hovers to a CARD's hover on a panel, which is the
 * seventh-instance bug §4 was written for. One attribute, and it is the whole fix.
 *
 * ── TWO CORRECTIONS WERE HERE AND BOTH WERE WRONG (owner, 2026-09-09) ────────────────
 *
 * Kept as a record rather than deleted, because the way they got in matters more than the
 * four lines they cost.
 *
 *   `p-1` -> `p-0` ON THE SHELL — A REAL REGRESSION, and the one you could see. The
 *   argument was "the shell pads 4px AND the group pads 4px AND the input wraps itself in
 *   `p-1 pb-0` — three nested insets, the same doubling that bit the Card, then the Modal,
 *   then the Popover." The pattern matched and the conclusion was still wrong: the three
 *   paddings do three different jobs, and the SHELL's is the one holding the list off the
 *   panel edge. Cancelling it ran every row flush to the border, which is not what the
 *   registry looks like and not what was approved anywhere.
 *
 *   `rounded-3xl` -> `rounded-card` ON THE SHELL — unnecessary. The corner was already
 *   right; this changed it for a reason ("the registry's literal does not track our
 *   ladder") that nobody had asked about and nothing had shown to be a problem.
 *
 * WHAT ACTUALLY WENT WRONG, because it is the general case: the component was never
 * rendered untouched and LOOKED AT before the wrapper was written. Both corrections came
 * from matching this file against a list of bugs found in other files. That is the exact
 * failure the Test page exists to prevent — §25's "a generated component does not arrive
 * as previewed" cuts both ways, and a correction applied pre-emptively is as unreviewed as
 * a preview. Render it bare, look, then correct one thing at a time.
 *
 * ── AND ONE THING THE CALLER MUST KNOW ───────────────────────────────────────────────
 *
 * `CommandItem` ALWAYS RENDERS A CHECK ICON — `ml-auto`, `opacity-0` until
 * `data-checked`. A filter row needs a COUNT on the right, and a count placed as a child
 * would land to the LEFT of an invisible tick and never reach the edge. The registry's own
 * escape hatch is `CommandShortcut`: its presence hides the check
 * (`group-has-data-[slot=command-shortcut]:hidden`). So the count is a `CommandCount`
 * below, which IS a CommandShortcut with the letter-spacing taken off — a keyboard
 * shortcut is spaced for reading as separate keys and a number is not.
 */

/* The registry's list caps itself at `max-h-72` (288px) and hides its scrollbar. Both are
 * kept: a cascade column that grows to its content is a column that runs off the screen,
 * and `no-scrollbar` is the registry's, not ours. */

/* THE SEPARATOR draws `bg-border/50` — half of a contextual edge. §8 says a divider inside
 * a surface that already has an edge is half that edge, which is what `--line-inset` means
 * and what the registry is spelling with `/50`. Left alone deliberately: it agrees. */

/* No class of our own — see above. The shell keeps the registry's own padding and corner,
 * and the attribute is the only thing this wrapper adds. */
function Command(props) {
  return <UiCommand data-overlay-surface="" {...props} />;
}

/* THE SEARCH BOX. `placeholder` names the INPUT ("Search strategy…"); the list below it is
 * named by `CommandList`'s own label — that split is FilterPanel's, and it is right: a
 * screen reader announcing "Strategy" on the input and nothing on the listbox leaves the
 * results unnamed.
 *
 * THE BRIGHT STRIP THAT WAS HERE IS FIXED IN THE BRIDGE, NOT IN THIS FILE (2026-09-09).
 * This component briefly carried `bg-transparent border-0` to put back what Tailwind's
 * preflight would have done — we do not import preflight, so the UA sheet painted its own
 * box over the middle of the search pill. That patch was the wrong shape: the border half
 * was ALREADY covered by a global reset, and fixing one component leaves the next one to be
 * found by eye. The background reset in `bridge.css` @layer base is now widened from
 * `button` to every generated form control, so this and everything after it is covered.
 * See that file, and `test/generated-resets.test.js`. */
function CommandInput(props) {
  return <UiCommandInput {...props} />;
}

function CommandList(props) {
  return <UiCommandList {...props} />;
}

function CommandGroup(props) {
  return <UiCommandGroup {...props} />;
}

function CommandItem(props) {
  return <UiCommandItem {...props} />;
}

function CommandSeparator(props) {
  return <UiCommandSeparator {...props} />;
}

/* THE COUNT ON THE RIGHT OF A ROW — see the header's last note. It is the registry's
 * `CommandShortcut` for one structural reason (its presence is what hides the always-
 * rendered check) and one visual correction: `tracking-widest` is right for ⌘K and wrong
 * for "142", where wide spacing reads as three separate figures. Tabular, because a column
 * of counts is a column of numbers and §12's rule about figures lining up does not stop
 * being true inside a menu. */
function CommandCount({ className, ...rest }) {
  return (
    <UiCommandShortcut
      className={['tracking-normal tabular-nums', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

/* "No matches". The registry centres it at `py-6`, which is right — an empty result is not
 * an error state (§15) and it must not look like one, so it stays a quiet line rather than
 * becoming an EmptyState with an icon and a sentence. */
function CommandEmpty(props) {
  return <UiCommandEmpty {...props} />;
}

export {
  Command, CommandCount, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator,
};
