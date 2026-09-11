/* data-table.jsx
 *
 * @design approved 2026-09-09 — 🔒 Cycle 00, piece 1. The owner signed it off on the Test
 *   page after four corrections landed in one day: thirteen columns rather than fifteen,
 *   per-column widths, results right-aligned while measurements stay centred, and a
 *   footer that can total. Sorting is permanently on and is part of the component.
 *   A redesigned screen may adopt it. See test/primitives-status.test.js.
 */

import React from 'react';
import { AlignLeft, ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from './checkbox.jsx';
import { Skeleton } from './skeleton.jsx';
import { cn } from '@/lib/utils';

/* THE DATA TABLE — the kit piece Cycle 00 exists for.
 *
 * There was no data table in this codebase. TWELVE files hand-rolled a `<table>`, and
 * the Trade Log's is the hardest of them: sixteen user-configurable columns, mixed cell
 * types in one row, row selection with an indeterminate header, a whole-row click that
 * has to survive interactive cells inside it, and a horizontal scroll that must not
 * scroll the page. This is that table, as an anatomy, once.
 *
 * ── WHAT THIS IS NOT: `PanelTable*` IN panel.jsx ─────────────────────────────────────
 *
 * The dashboard already has a table vocabulary and it stays exactly as it is. It is a
 * three-column CSS grid of divs for a six-row list inside a fixed-height card, with no
 * hairline between rows because "six rows with five rules between them reads as a
 * spreadsheet".
 *
 * THIS ONE IS THE SPREADSHEET, DELIBERATELY. Four differences, and each is the reason
 * the two are separate objects rather than one with a flag:
 *
 *   1. It is a real `<table>`. Sixteen columns whose widths must agree between header
 *      and body, a `colSpan` for the state rows, `<thead>` for a sticky header, and the
 *      row/column semantics a screen reader needs to read a grid. A div grid gives none
 *      of that.
 *   2. It has hairlines between rows. Four hundred rows scanned for a pattern need row
 *      separation; six rows summarised on a card do not.
 *   3. Its header sticks. PanelTableHead is a band that scrolls with its card.
 *   4. Its body text is 14px, not 12px. This is the primary content of a full page, not
 *      a compact list inside a card.
 *
 * Everything else is cut from the dashboard on purpose — the header band is
 * PanelTableHead's recipe on `--control-bg`, at the dashboard's header-to-body RATIO
 * rather than its absolute size, because difference 4 above changes the body. See the
 * long note on the head cell.
 *
 * ── BUILT ON @shadcn/table, base-rhea (§1 step 2) ────────────────────────────────────
 *
 * Installed 2026-09-09. It is a thin component — semantic elements plus a handful of
 * classes — which is the right amount for a table: the layout of sixteen columns is the
 * application's problem, and what a library can usefully own is the anatomy. Every part
 * below wraps the generated one; none of them forks it.
 *
 * ⚠ TWO REGISTRY FACTS THIS FILE GOT WRONG ONCE EACH, both recorded rather than tidied.
 *
 * THE FIRST: `@coss` WAS NEVER SEARCHED. §1 orders `@shadcn` then `@coss` for what
 * shadcn does not ship, and `@shadcn/table` existing was treated as the end of the
 * question. `@coss` ships `p-table-3` — "Table with TanStack Table and checkboxes" — and
 * a checkbox WITH an indeterminate state, which this file then hand-drew. The anatomy
 * below is still the shadcn table (that part of the ruling holds: a pattern is not a
 * reason to pull a second implementation), but the selection box came off coss and the
 * hand-drawn dash is gone. See `checkbox.jsx`.
 *
 * ⚠ THE SECOND: THE REGISTRY ITEM SHIPS A BROKEN `cn` IMPORT. `@shadcn/table` at base-rhea writes
 * `import { cn } from "cn"` and declares an npm package by that name as a dependency,
 * while the other 27 components in `components/ui` import `@/lib/utils`. Ours is
 * `clsx` + `tailwind-merge`; the npm one is not, so every `className` override in this
 * file would have stopped replacing the class it was overriding — silently. Repointed at
 * install and the package uninstalled. Reported to the owner rather than fixed quietly.
 *
 * ── NO TABLE ENGINE LIVES IN HERE, AND THAT IS A DECISION ────────────────────────────
 *
 * `@tanstack/react-table` v9 is installed and the plan names it for the sixteen columns,
 * selection and sorting. It is NOT imported here. This file is the presentational
 * anatomy; a page drives it, with TanStack or with the plain column spec the Trade Log
 * already has (`tradeColumns.js`, which is asserted directly by
 * `test/trade-log-view.test.js` precisely because it is plain data).
 *
 * WHY THE SEAM IS HERE: eleven of the twelve hand-rolled tables are small — Settings,
 * Prop OS, Reports, the strategy comparison. They need the anatomy and none of them
 * needs a table engine. Putting TanStack inside this component would make adopting the
 * LOOK conditional on adopting the ENGINE, and the eleven would keep their own tables.
 */

/* ── ALIGNMENT IS A PROP, NOT A CLASS ────────────────────────────────────────────────
 *
 * §1: Tailwind utilities compile only under `components/{ui,primitives}`. `text-right`
 * written in a page emits NOTHING, with no error — and "text-right on a table header"
 * is literally one of the five entries in §1's table of times this has cost debugging
 * time. `PanelTableCell` takes `align` for the same reason. So does this. */
const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' };

/* ── `narrow` — THE SELECTION COLUMN, AND A CLASS THAT COMPILED TO NOTHING ────────────
 *
 * No horizontal padding, and a width the caller sets through `widths` — 36px on the
 * Trade Log, down from the shipped 44px, because the owner asked for the box closer to
 * Date & Time. The shipped reason for narrowing it at all still holds: "it holds a 14px
 * box, so giving it an equal share of the width would leave a gap the size of a data
 * column". `w-11` stays as the FALLBACK for a table that supplies no widths — a
 * `<colgroup>` takes precedence over a cell width in fixed layout, so a caller-supplied
 * 36px wins and a caller who supplies nothing still gets a sane gutter.
 *
 * THE BOX IS CENTRED IN IT, AND IT WAS NOT. The body cell asked for
 * `'w-11 px-0 text-center'` and then passed `ALIGN[align]` further down the same `cn()`
 * — and `cn()` is tailwind-merge, so the LAST alignment wins and `text-center` was
 * dropped. The header never asked at all. Both ended up `text-left`, which in a cell with
 * zero padding means the tick box sat hard against the card's left border, under its 24px
 * corner. The owner saw it as "the checkbox placement is off"; the cause is a utility that
 * emitted nothing with no error, which is this codebase's signature failure.
 *
 * SO ALIGNMENT IS RESOLVED ONCE, HERE, and `narrow` wins. A caller cannot align the
 * selection column, because there is only one right answer for a 16px box in a 44px
 * gutter and both the header and the body have to agree on it or they visibly do not. */
const NARROW = 'w-11 px-0 text-center';

/* ── ONE RESOLUTION, READ BY THE HEADER AND THE BODY ─────────────────────────────────
 *
 * THE HEADER FOLLOWS ITS COLUMN (owner, 2026-09-09) — Net P&L right because its figures
 * are, Entry centred because its figures are, a text column left. It briefly did not: the
 * owner asked for centred headings, I wrote a `'center'` FALLBACK, and the fallback was
 * unreachable because `align` had a default PARAMETER of `'left'` two lines above it. So
 * every header rendered left, which is neither rule — and the test passed, because it
 * asserted that the string `gutter(narrow, align, 'center')` appeared in the source rather
 * than that any header was centred. A test that reads source instead of behaviour is a
 * test that agrees with whatever you wrote.
 *
 * SO THE ALIGNMENT IS RESOLVED HERE, ONCE, and both cells call it with the same two
 * values. A header and its column computing alignment separately is the same class of bug
 * as a header and its column computing WIDTH separately, which is why widths moved into a
 * `<colgroup>` an hour earlier. `narrow` still wins outright: there is one right answer
 * for a 16px box in a 36px gutter. */
const resolveAlign = (align, numeric, narrow) => {
  if (narrow) return 'center';
  return align || (numeric ? 'center' : 'left');
};
const gutter = (narrow, align) => (
  narrow ? [NARROW] : ['px-3', ALIGN[align] || ALIGN.left]
);

/* ── WHAT THE ROW HAIRLINE IS, per §8 ───────────────────────────────────────────────
 *
 * The registry draws `border-b`, which is `--color-border` -> `--chrome-line` -> a
 * CARD'S EDGE. §8: "a divider inside a surface that already has an edge is HALF that
 * edge, so it reads as a division rather than a second border. In a card it is
 * `--line-inset`, the quietest line in the ramp."
 *
 * The shipped Trade Log draws `--line` — the card's own edge — four hundred times. That
 * is the same fault Batch 5 found on the divider (`bg-border` on a card), corrected the
 * same way: the ramp already names the value, so this is reading its intent rather than
 * picking a colour by eye. */
const HAIRLINE = 'border-b border-b-[var(--line-inset)]';

/* ── THE SHELL ──────────────────────────────────────────────────────────────────────
 *
 * ── `widths` — EVERY COLUMN WAS THE SAME WIDTH, AND THAT WAS WRONG (owner, 2026-09-09) ─
 *
 * `table-layout: fixed` divides the width EVENLY across the visible columns unless it is
 * told otherwise, and nothing told it otherwise. So "Type" — which holds the word "Sell" —
 * got exactly as much room as "Setup", which holds "Break & Retest" and truncated to
 * "Break & Retes". The shipped table has the same fault and the same reason written in its
 * CSS: even widths stop one column claiming the table, which is what the old Comments
 * column did.
 *
 * THAT TRADE IS UNNECESSARY. Fixed layout is precisely the mode that lets a column be
 * given a width safely — content still cannot claim more than it is allotted, which is the
 * protection that was wanted. It only ever needed telling. So `widths` is a per-column
 * array and it renders a `<colgroup>`.
 *
 * A COLGROUP RATHER THAN A WIDTH PER CELL, and that is the point of the choice: the header
 * and the body then read the SAME declaration. Width on the cells is two declarations
 * that have to agree, and this component has already shipped one head/body disagreement
 * (the selection column's alignment) — a class that compiled to nothing on one side.
 *
 * A specified set that sums to less than the table distributes the surplus in proportion,
 * so these numbers are ratios that happen to be honest minimums rather than a fixed
 * layout that breaks at another width.
 *
 * `minColWidth` and `cols` REMAIN as the fallback for a table that supplies no widths —
 * eleven small tables in this app still hand-roll their own and will adopt this component
 * before they think about column widths. With `widths` given, the floor is their SUM,
 * which is the honest number rather than a per-column guess.
 *
 * ── `scroll` EXISTS BECAUSE overflow-x AND A STICKY HEADER CANNOT BOTH BE FREE ───────
 *
 * The registry wraps its `<table>` in `overflow-x-auto`. That is right for a table in a
 * box and WRONG for a full-page log, and the reason is a CSS rule that is easy to miss:
 * when one axis of `overflow` is not `visible`, the other computes to `auto` too. So
 * `overflow-x-auto` silently makes the container a scroll container in BOTH axes, and a
 * `<thead>` sticking to the viewport under the top bar sticks to that box instead — it
 * stops following the page and never appears.
 *
 *   `scroll="page"`  the PAGE scrolls; the container is `overflow-visible` and the head
 *                    sticks to `--topbar-h`. This is the Trade Log, and the shipped CSS
 *                    reaches the same place with `.log-panel .grid-wrap { overflow: visible }`.
 *   `scroll="self"`  the TABLE scrolls in its own box, header sticky to the top of it.
 *                    A table inside a card of fixed height.
 *
 * The override lands on the registry's container through its own `data-slot`, from the
 * shell — the container is not exposed as a prop, and reaching it this way keeps
 * `shadcn add --overwrite` safe. §25's rule: absorb the difference in the WRAPPER. */
/* THE MAP IS HOISTED OUT OF `cn()` DELIBERATELY, and this is a test telling the truth
 * about a real hazard rather than a nuisance. `utility-collisions.test.js` reads every
 * string literal inside a `cn(...)` call as a class list, because that is what they
 * normally are — so a `scroll === 'page' ? … : …` written INSIDE the call contributes
 * `page` to the set of utilities this library ships, and `.page` is a real legacy class
 * name on eighteen screens. The test's own header names `page` as the false positive it
 * was fixed for once already. Keeping comparison literals out of `cn()` makes it
 * impossible rather than exempted — the exemption list is a debt register, not a knob. */
const CONTAINER = {
  page: '[&_[data-slot=table-container]]:overflow-visible',
  self: '[&_[data-slot=table-container]]:max-h-full [&_[data-slot=table-container]]:overflow-auto',
};

/* ── THE CORNERS ARE SQUARE (owner, 2026-09-09), AND THE CARD IS NEVER CLIPPED ────────
 *
 * There was an `edge` prop that rounded the four outer cells — 24px against a card's own
 * border, 18px inside a padded one. The owner looked at both and chose straight: "instead
 * of rounded corners for table keep them straight."
 *
 * IT IS ALSO THE SIMPLER ANSWER NOW THAT THE TABLE IS INSET. Sitting inside a padded
 * `PanelCard` it never meets the card's curve, so there is nothing for a rounded corner to
 * agree with — the radius was solving a problem the layout had already removed. A rounded
 * header band floating 24px inside a rounded card is two curves at different radii with a
 * gap between them, which reads as sloppier than a straight edge, not softer.
 *
 * ⚠ WHAT MUST NOT COME BACK IS THE CLIP. The corner problem's tempting fix is
 * `overflow: hidden` on the card, and that was shipped here for an hour. Any overflow but
 * `visible` makes an element a scroll container, a sticky child sticks to its nearest
 * scroll container, and `top: var(--topbar-h)` stops meaning "below the top bar" and
 * starts meaning "50px below the top of this card" — a header pinned in the middle of its
 * own table. Same CSS fact the `scroll` prop is about, reached from the other direction,
 * which is how it got past me twice in one component. Held by kit-data-table.test.js.
 *
 * THE LAST ROW'S HAIRLINE ALWAYS GOES, and that is not part of the corner question. §8: a
 * divider divides two things, and below the final row there is nothing — it is a rule to
 * nowhere. The registry agrees and drops it by default (`[&_tr:last-child]:border-0` on
 * TableBody); ours has to say so again because the rule is drawn on the CELLS here, which
 * that selector does not reach. */
const NO_LAST_RULE = '[&_tbody_tr:last-child_td]:border-b-0';

function DataTable({
  cols, widths, minColWidth = 92, scroll = 'page', stickyTop = 'var(--topbar-h, 50px)',
  className, style, children, ...rest
}) {
  const pageScroll = scroll !== 'self';
  const min = widths
    ? `${widths.reduce((a, b) => a + b, 0)}px`
    : (cols ? `${cols * minColWidth}px` : undefined);
  return (
    <div
      data-slot="data-table-shell"
      data-scroll={scroll}
      // See the block above. `overflow-x-auto` in both axes is what breaks a sticky head.
      className={cn(
        'w-full',
        CONTAINER[scroll] || CONTAINER.page,
        NO_LAST_RULE,
        className,
      )}
      style={{ '--pv-table-sticky-top': pageScroll ? stickyTop : '0px', ...style }}
      {...rest}
    >
      <Table
        className="table-fixed border-separate border-spacing-0"
        style={{ minWidth: min }}
      >
        {/* Inline `style`, not a class: a width per column cannot be enumerated as a
            utility, and a class written by the CALLER would compile to nothing anyway
            (§1). This is the same reason SkeletonBlock takes `w` as a prop. */}
        {widths ? (
          <colgroup>
            {widths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
          </colgroup>
        ) : null}
        {children}
      </Table>
    </div>
  );
}

/* ── THE HEADER BAND ────────────────────────────────────────────────────────────────
 *
 * PanelTableHead's recipe, on a `<thead>`: `--control-bg`, 12px, semibold, `--text-2`.
 * The dashboard is the reference and this is the piece of it that transfers exactly.
 *
 * `border-separate` on the shell rather than the registry's `border-collapse` is what
 * makes the sticky header possible at all: a collapsed border is painted by the table,
 * not the cell, so a sticky `<th>` leaves its own bottom rule behind and scrolls out
 * from under it. Every rule in this table is therefore a cell border, which is also why
 * the head's rule is on the `<th>` below and not here. */
function DataTableHeader({ className, children, ...rest }) {
  return (
    <TableHeader
      data-slot="data-table-header"
      className={cn('[&_tr]:border-0', className)}
      {...rest}
    >
      {children}
    </TableHeader>
  );
}

const SORT_ICON = { asc: ArrowUp, desc: ArrowDown };

/* Hoisted for the same reason CONTAINER is — see the note above it. */
const JUSTIFY = { right: 'justify-end', center: 'justify-center', left: null };

/* A column title.
 *
 * SORTING IS PART OF THIS COMPONENT AND ALWAYS ON (owner, 2026-09-09). It took three
 * passes to land there, and the middle one was mine to get wrong.
 *
 * It began as "the brief asks for sorting, the product has none, so build the affordance
 * and leave it off on the screen" — right under §2, which forbids a control the product
 * cannot honour. Then: "I want sorting in the app too." I read that as a Cycle 01 change
 * and flagged it as premature, since /trades still renders the legacy table and a sort
 * bolted onto that would be deleted the week the page migrates. The owner meant something
 * narrower and better: sorting belongs to THIS COMPONENT, permanently, so the day the
 * Trade Log moves onto it the page gains sorting as a CONSEQUENCE of the migration rather
 * than as a separate feature. §2 is satisfied either way — nothing is added to a page the
 * product cannot honour, because the page has not changed yet.
 *
 * So there is no flag and no toggle. A column sorts if its caller hands it an `onSort`;
 * Notes does not, because "has a note" is a yes/no and sorting by one is really a filter,
 * and no column of a summary table does either. Client-side over the rows already in hand,
 * so no API. Three clicks — descending, ascending, cleared — because no-sort is a real
 * state and a trader who sorted by mistake needs the log's own order back.
 *
 * The glyph is `ChevronsUpDown` when a column is sortable but unsorted, and it FADES IN
 * on hover rather than being absent — §14: "a hover affordance fades, it does not
 * unmount", because a header that reflows under the pointer is harder to click. Its
 * keyboard twin is `group-has-[:focus-visible]` and NOT `group-focus-within`, for the
 * reason written out on DataTableSelect below: a mouse click leaves focus behind, so
 * `:focus-within` would strand the chevron visible after a sort was cleared. */
function DataTableHeadCell({
  align, numeric = false, narrow = false, sort = null, onSort,
  className, children, ...rest
}) {
  /* `numeric` here does NOT make the label monospaced — it is the same input the body
   * cell takes, passed so the two resolve to the same alignment from the same values
   * rather than from two guesses that agree today. */
  const a = resolveAlign(align, numeric, narrow);
  const Glyph = SORT_ICON[sort] || ChevronsUpDown;
  /* A COLUMN SORTS IF IT WAS GIVEN A HANDLER. There was a separate `sortable` flag beside
   * this, from when sorting was a thing you switched on; with sorting permanent (owner,
   * 2026-09-09) it was a second way to say the same thing, and two ways to express one
   * state is how a header comes to show a chevron that does nothing. A column with no
   * `onSort` — Notes, or every column of a summary table — simply has no affordance. */
  const interactive = Boolean(onSort);
  return (
    <TableHead
      data-slot="data-table-head-cell"
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
      className={cn(
        'group sticky top-[var(--pv-table-sticky-top)] z-[1]',
        'h-9 bg-[var(--control-bg)]',
        // Not `border-b`: see DataTableHeader. This is the head's own rule, and it is
        // the card's edge rather than --line-inset because it separates two BANDS, not
        // two rows of one list.
        'border-b border-b-[var(--line)]',
        /* ── 14px / 500, WHICH IS THE DASHBOARD'S RATIO AND NOT ITS NUMBER ─────────────
         *
         * This was `text-xs leading-[14px] font-semibold` — `PanelTableHead`'s recipe,
         * copied verbatim so the two would read as one family. The owner said the header
         * size was wrong and they were right, for a reason that only shows when you put
         * the two tables side by side:
         *
         *   the dashboard   12px header over a 12px body   ratio 1 : 1
         *   this table      12px header over a 14px body   ratio 12 : 14
         *
         * The body here is 14px because this is a full page's primary content rather than
         * a compact list in a card (see the four differences at the top of this file). So
         * copying the header's ABSOLUTE size onto it made the header proportionally
         * smaller than it is on the dashboard — and 1px under what /trades ships today.
         *
         * Matching the RATIO is the faithful reading of "cut from the dashboard", and it
         * costs nothing: the header/body distinction was never carried by size. It is
         * carried by WEIGHT and COLOUR, which are still here — 500 against the body's 400,
         * `--text-2` against `--text-body`, on a `--control-bg` band. Owner chose it from
         * four candidates rendered over the same rows (2026-09-09).
         *
         * `leading-[18px]` is measured rather than taken off the scale, the same way every
         * line-height in panel.jsx is and for the same reason recorded there: derived
         * leadings round up a pixel at a time and the error only shows across a card. */
        'text-sm leading-[18px] font-medium text-[var(--text-2)]',
        /* A HEADING IS CENTRED, WHATEVER ITS COLUMN DOES (owner, 2026-09-09). The body
           aligns by what the figure is for — a measurement across, a result down — and
           the header does not follow it: a label names a column and sits over the middle
           of it. The shipped table centres every header too, so this is the half of its
           behaviour that was right. `align` remains for the exception nobody has yet. */
        gutter(narrow, a),
        className,
      )}
      {...rest}
    >
      {interactive ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'inline-flex w-full items-center gap-1.5 outline-none',
            'rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
            /* THE BUTTON HAS TO BE ALIGNED SEPARATELY, and forgetting it is what made
               every header left even where the cell said otherwise: a flex container
               lays its children out by `justify-*`, and `text-*` on the <th> does
               nothing to them. It reads the same resolved value as the cell above. */
            JUSTIFY[a],
          )}
        >
          {children}
          <Glyph
            aria-hidden="true"
            className={cn(
              'size-3 shrink-0 transition-opacity duration-[var(--dur-fast)]',
              sort
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-60 group-has-[:focus-visible]:opacity-60',
            )}
          />
        </button>
      ) : children}
    </TableHead>
  );
}

function DataTableBody({ className, children, ...rest }) {
  return (
    <TableBody data-slot="data-table-body" className={className} {...rest}>
      {children}
    </TableBody>
  );
}

/* ── THE FOOTER — A TABLE THAT TOTALS ITSELF ─────────────────────────────────────────
 *
 * Added 2026-09-09 for the finance summary specimen. Not every table has one: a trade log
 * does not total, because the KPI row above it already does and §24 forbids saying it
 * twice. A cost-and-return breakdown DOES — the whole point of the rows is what they add
 * up to, and a total that lives anywhere but under its column is a total the reader has to
 * carry in their head.
 *
 * WHAT THE REGISTRY GIVES AND WHAT IT CANNOT KEEP. `TableFooter` ships
 * `border-t bg-muted/50 font-medium`, and two of those three are wrong here for reasons
 * already recorded on the row: `bg-muted` resolves to `--chrome-hover`, the same token a
 * hovered ROW uses, so a footer would read as permanently hovered; and `border-t` is
 * `--color-border`, a card's EDGE, where §8 wants half of it inside a surface that has
 * one. The rule above a total is `--line-strong` rather than `--line-inset` though — §4
 * names it "THE standard visible border — dashed empties, SEPARATORS", and this one
 * separates the sum from what it sums rather than one row from the next.
 *
 * `font-medium` is kept and is the only weight in the table above 400, which is the
 * point: a total is the one figure in a summary you are allowed to find first. */
function DataTableFooter({ className, children, ...rest }) {
  return (
    <TableFooter
      data-slot="data-table-footer"
      className={cn(
        'bg-transparent',
        '[&_td]:border-t [&_td]:border-t-[var(--line-strong)]',
        '[&_td]:h-[37px] [&_td]:px-3 [&_td]:py-2 [&_td]:align-middle',
        '[&_td]:text-sm [&_td]:text-[var(--text)]',
        className,
      )}
      {...rest}
    >
      {children}
    </TableFooter>
  );
}

/* ── A ROW ──────────────────────────────────────────────────────────────────────────
 *
 * Three things the registry's `TableRow` does that this table cannot take as they come,
 * and all three are §25's "a generated component does not arrive as previewed":
 *
 *   · `hover:bg-muted/50` — `--color-muted` is `--chrome-hover` (`--surface-hover`,
 *     #1c1c1f on a card). At 50% over #111114 that lands near #171719, weaker than the
 *     hover every other row in the app gets. §14 says hover INTENSIFIES; the dashboard's
 *     own rows use the token at full strength, so this does.
 *   · `data-[state=selected]:bg-muted` — the same value as hover, so a selected row and
 *     a hovered row would be indistinguishable, and selection is what the bulk-action
 *     bar acts on. `--sel-bg` is the token tokens.css documents as "a quiet ACTIVE fill"
 *     and it is one step up from hover, which is the separation this needs.
 *   · `border-b` — see HAIRLINE.
 *
 * `tone="attention"` IS A LEFT EDGE, NOT A WASH, AND THAT IS §17. The shipped table
 * paints an untagged row's whole background `--tint-warn-1`. Two rules say no: the
 * `--tint-*` family is fenced off for legacy only, and §17 puts a system colour on the
 * GLYPH and the EDGE — never on a surface, and "never anything inside a data surface: a
 * table cell, a KPI figure. There, red and green are the trader's money." A warm wash
 * behind a row of P&L figures is the app competing with the numbers it is showing. The
 * edge says the same thing and leaves the row's own colour to the trade.
 *
 * `interactive` is what makes the whole row clickable. It stays a prop rather than being
 * assumed, because eleven of the twelve tables in this app have rows that do nothing. */
const ROW_TONE = {
  attention: 'shadow-[inset_2px_0_0_0_var(--warning)]',
};

/* THE ARRIVAL FLASH — owner-approved 2026-09-09, and it is a REBUILD rather than a new
 * behaviour: the shipped table already flashes a row green for two seconds when a trade
 * lands from MT5, and dropping it would have been a silent feature deletion. The
 * animation filter permits it exactly — "animate only real state changes the user must
 * follow" — and a position closing in MT5 and appearing here is the clearest one in the
 * app.
 *
 * WHAT CHANGED IN THE REBUILD: the keyframe moved from `legacy/app.css` (frozen, and
 * dies with that file) into `bridge.css` beside the app's other five, and its colour came
 * off `--tint-profit-7` onto `--profit-bg`, because the `--tint-*` family is fenced off
 * for legacy only. The 2s is unchanged, deliberately — see the keyframe's own note for
 * why that duration is not on §10's ladder and what is being asked of the owner. */
const FLASH = 'animate-[pv-row-flash_2s_var(--ease)]';

function DataTableRow({
  selected = false, interactive = false, tone, flash = false, className, children, ...rest
}) {
  return (
    <TableRow
      data-slot="data-table-row"
      data-state={selected ? 'selected' : undefined}
      className={cn(
        // `group`, so the selection box can fade in on hover AND on focus-within.
        'group border-0',
        interactive && 'cursor-pointer',
        'transition-colors duration-[var(--dur-fast)]',
        'hover:bg-[var(--surface-hover)]',
        selected && 'bg-[var(--sel-bg)] hover:bg-[var(--sel-bg-strong)]',
        tone && ROW_TONE[tone],
        // Last, so it paints over the resting fill for the two seconds it runs. It does
        // not fill forwards, so hover and selection resume the moment it ends.
        flash && FLASH,
        className,
      )}
      {...rest}
    >
      {children}
    </TableRow>
  );
}

/* ── A CELL ─────────────────────────────────────────────────────────────────────────
 *
 * `numeric` MEANS TABULAR FIGURES. IT DOES NOT MEAN RIGHT-ALIGNED (owner, 2026-09-09).
 *
 * It used to mean both, on the argument that they are one decision — a column of figures
 * that is not right-aligned cannot be scanned for magnitude. The owner split it, and the
 * split is a real distinction rather than a compromise:
 *
 *   A MEASUREMENT is centred — an entry price, an exit price, a volume, a pip size. You
 *   read one of these to answer "what was it", against the row it is in.
 *
 *   A RESULT is right-aligned — R, net P&L, commission. You read a COLUMN of these to
 *   answer "which of these is big", down the table, and that only works when the decimal
 *   points and the minus signs line up.
 *
 * Both keep `tabular-nums`, because a wandering decimal point is wrong either way.
 *
 * So a caller writes `numeric` for a figure and adds `align="right"` for the two or three
 * columns that are results. The shipped table centres everything including the results,
 * which keeps the tabular figures and throws away what they are for; it right-aligned
 * nothing, and this changes two columns rather than seven.
 *
 * `truncate` on every cell is required by `table-fixed`: over-long content overflows
 * rather than widening its column, so every cell has to be able to end in an ellipsis.
 *
/* `tone` COLOURS THE FIGURE. IT DOES NOT FILL THE CELL (owner, 2026-09-09).
 *
 * It used to do both, copying the shipped table — `.cell-win { background: var(--win-bg);
 * color: var(--profit) }` — on the reading that §17 reserves a data surface for the
 * trader's money and therefore permits a wash there. The owner looked at it and said
 * remove it, and on reflection the wash was wrong for three separate reasons:
 *
 *   · IT SAYS THE SAME THING THREE TIMES. The row already carries a Status badge reading
 *     "Win" in green and a figure printed in green. A green block behind that figure is a
 *     third statement of one fact, and §24 is explicit: "two identical facts teach the
 *     reader that neither is worth reading."
 *   · IT IS THE LOUDEST THING IN THE TABLE, and it is not the most important. A column of
 *     filled blocks reads before the figures inside them, so the eye lands on the colour
 *     and then has to go back for the number.
 *   · IT IS THE SAME CORRECTION §17 ALREADY MADE ELSEWHERE. The alert's surface wash came
 *     off every tone on 2026-09-08 for exactly this reason ("too colorful — doesn't go
 *     with our theme"). The figure keeps full-strength colour; the surface stays neutral.
 *
 * Breakeven is BLUE rather than grey — grey read as "no data" beside the green and red
 * rows, when in fact the trade closed flat, which is a result. */
const CELL_TONE = {
  profit: 'text-[var(--profit)]',
  loss: 'text-[var(--loss)]',
  be: 'text-[var(--be)]',
  muted: 'text-[var(--muted)]',
  /* A CAPTION RATHER THAN A FIGURE — a footer's "Spent on fees" beside its total.
   * `--text-2` and not `--muted` because it is a LABEL, and the owner locked
   * "`var(--text-2)` at full opacity is the standard label colour app-wide". */
  label: 'text-[var(--text-2)]',
};

/* `strong` IS A PROP, NOT A CLASS, and the test caught me writing it as one. The summary
 * specimen set `className="font-medium"` on its total row from a page file, where a
 * Tailwind utility compiles to NOTHING (§1) — the total would have rendered at the same
 * weight as every row above it, silently. `PanelTableCell` has carried a `strong` prop
 * since the dashboard for exactly this reason. */
function DataTableCell({
  align, numeric = false, narrow = false, strong = false, tone, className, children, ...rest
}) {
  // A figure defaults to CENTRED — see the block above. `align="right"` is the opt-in
  // for the columns that are read down rather than across. Resolved by the shared
  // helper, so the header over this cell cannot land anywhere else.
  const a = resolveAlign(align, numeric, narrow);
  return (
    <TableCell
      data-slot="data-table-cell"
      className={cn(
        HAIRLINE,
        'h-[37px] py-2 align-middle',
        'truncate text-sm text-[var(--text-body)]',
        numeric && 'font-mono tabular-nums',
        strong && 'font-medium',
        gutter(narrow, a),
        tone && CELL_TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </TableCell>
  );
}

/* ── THE SELECTION BOX ──────────────────────────────────────────────────────────────
 *
 * One thing this has to solve, and one it USED to.
 *
 * 1. THE INDETERMINATE DASH IS THE COMPONENT'S, NOT OURS — CORRECTED 2026-09-09.
 *    This file drew the dash itself, with `data-[indeterminate]:before:` rules, and
 *    wrote up "the registry has no indeterminate state" as a finding. That was true of
 *    `@shadcn/checkbox` and FALSE of the registry: `@coss/checkbox` renders the dash
 *    from `state.indeterminate`. §1 step 3 exists for exactly this — "@coss only for
 *    what @shadcn does not ship" — and it was never searched, because the Cycle 00
 *    brief's line "the kit needs almost no @coss" was taken as a check already done.
 *    The owner spotted it. `checkbox.jsx` is on coss now and those rules are deleted;
 *    all this component does is pass `indeterminate` through.
 *
 * 2. IT FADES IN, AND ITS KEYBOARD TWIN IS `:focus-visible` — NOT `:focus-within`.
 *    A box on every one of four hundred rows is noise, so it is revealed by the row. §14
 *    requires a keyboard twin for every hover treatment, and the first version used
 *    `group-focus-within`, which satisfies the rule and breaks the interaction:
 *
 *    A MOUSE CLICK LEAVES FOCUS BEHIND. `:focus-within` matches focus from any source, so
 *    ticking a box and then unticking it and moving the pointer away left that row's box
 *    visible for the rest of the session — one row wearing a hover state nobody was
 *    hovering. The owner found it. `:focus-visible` is the browser's own answer to
 *    exactly this question: it matches only when focus arrived in a way that wants a
 *    focus ring, which is keyboard navigation.
 *
 *    `group-has-[:focus-visible]` rather than the checkbox's own `has-[:focus-visible]`,
 *    so tabbing to ANY focusable thing in the row reveals the column — the shipped table
 *    gates on the box's own focus alone, so a keyboard user moving through a row's links
 *    sees an empty gutter. Opacity, not display, so revealing one does not shift the row,
 *    and a TICKED box always shows because hiding it would hide the selection itself.
 *
 * `stopPropagation` on click and change, because the row is interactive and the cell is
 * too — brief §4.1's "the row is interactive AND contains interactive cells; the design
 * must make that survivable". Ticking a box must not open the trade. */
function DataTableSelect({
  checked = false, indeterminate = false, onCheckedChange, label,
  always = false, className, ...rest
}) {
  const on = checked || indeterminate;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center transition-opacity duration-[var(--dur-fast)]',
        always || on
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100',
      )}
    >
      <Checkbox
        aria-label={label}
        checked={checked}
        indeterminate={indeterminate}
        onCheckedChange={onCheckedChange}
        onClick={(e) => e.stopPropagation()}
        className={className}
        {...rest}
      />
    </span>
  );
}

/* A two-line cell — a date over its time. The pair reads as one timestamp instead of two
 * values competing for the column's width, which is what the shipped `.cell-dt` /
 * `.cell-time` do. Line heights measured rather than taken off the scale, the same way
 * panel.jsx's are and for the same reason: two rounded-up leadings are invisible per row
 * and a clipped row across four hundred of them. 17 + 3 + 15 = 35, inside the 37px row. */
function DataTableStack({ sub, className, children, ...rest }) {
  return (
    <span data-slot="data-table-stack" className={cn('block leading-[17px]', className)} {...rest}>
      {children}
      {sub == null ? null : (
        <span className="mt-[3px] block text-xs leading-[15px] tabular-nums text-[var(--muted)]">
          {sub}
        </span>
      )}
    </span>
  );
}

/* A NOTE IS AN ICON, NOT THE PROSE. A comment can run to paragraphs, and printing it
 * inline made one column as wide as all the others put together. The icon says "there is
 * a note here"; the row opens the full text.
 *
 * lucide, not a hand-drawn path — §23. The shipped version draws its own three-line SVG,
 * which is the thing that section forbids by name.
 *
 * The colour lifts with the row's hover, which is §14 read literally: it intensifies what
 * the glyph already wears. `group-has-[:focus-visible]` is its keyboard twin — see
 * DataTableSelect for why it is not `group-focus-within`. */
function DataTableNote({ label = 'Has a note', className, ...rest }) {
  return (
    <span
      data-slot="data-table-note"
      aria-label={label}
      className={cn(
        'inline-flex text-[var(--text-2)] transition-colors duration-[var(--dur-fast)]',
        'group-hover:text-[var(--text)] group-has-[:focus-visible]:text-[var(--text)]',
        className,
      )}
      {...rest}
    >
      <AlignLeft aria-hidden="true" className="size-3.5" />
    </span>
  );
}

/* A MISSING VALUE IS A DASH, AND IT IS NEVER A ZERO. §12: "no data is not a zero value".
 * An em dash in the muted colour, in one place, so four hundred rows cannot disagree
 * about what "nothing" looks like. */
function DataTableDash({ className, ...rest }) {
  return (
    <span
      data-slot="data-table-dash"
      aria-label="No value"
      className={cn('text-[var(--muted)]', className)}
      {...rest}
    >
      —
    </span>
  );
}

/* ── THE STATES — §15 ───────────────────────────────────────────────────────────────
 *
 * All three land INSIDE the table, in a full-span cell, and that is the point: the table
 * keeps its header, its width and its shell, so nothing about the page moves between
 * "loading", "nothing here" and "this failed". A state that replaces the whole table
 * with a centred box is a layout jump wearing a state's clothes.
 *
 * EMPTY AND ERROR ARE NOT DRAWN HERE. `EmptyState` and `Alert` are approved primitives
 * (Batch 6 and Batch 3) and they are what belongs in the cell. §1 step 1, actually
 * working: this file supplies the cell, the page supplies the sentence — because what
 * belongs in an empty state is a product decision, and "No trades yet — close a trade in
 * MT5 and it appears here instantly" is not something a table can write. */
function DataTableNotice({ colSpan, className, children, ...rest }) {
  return (
    <TableRow data-slot="data-table-notice" className="border-0 hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className={cn('p-6 align-middle whitespace-normal', className)}
        {...rest}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

/* THE SKELETON MIRRORS THE TABLE, IN THE REAL ROWS, AT THE REAL HEIGHT — §15, which
 * asks for exactly that and names the failure it prevents: "a skeleton that reserves a
 * different SHAPE from its content is the layout jump it exists to prevent". So this is
 * not a block where the table will be; it is `rows` real `<tr>`s of `cols` real `<td>`s
 * at 37px, with the header already drawn above them. When the trades land, nothing moves.
 *
 * Lines are pill-shaped — §15: "a rounded bar reads as writing that has not arrived".
 * Widths alternate off a fixed pattern rather than randomly, because a skeleton that
 * reshuffles on every render is motion nobody asked for (the animation filter: animate
 * only real state changes the user must follow).
 *
 * `label` is required by §15's other half: "say WHAT is loading, not just that something
 * is". It goes on the region with `aria-busy`. */
const SKELETON_WIDTHS = ['62%', '48%', '74%', '55%', '68%', '44%'];

function DataTableSkeleton({ cols = 8, rows = 8, label = 'Loading rows', ...rest }) {
  return (
    <TableBody data-slot="data-table-skeleton" aria-busy="true" aria-label={label} {...rest}>
      {Array.from({ length: rows }, (_, r) => (
        <TableRow key={r} className="border-0 hover:bg-transparent">
          {Array.from({ length: cols }, (_, c) => (
            <TableCell
              key={c}
              className={cn(HAIRLINE, 'h-[37px] px-3 py-2 align-middle')}
            >
              <Skeleton
                className="h-3 rounded-full"
                style={{ width: SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length] }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

export {
  DataTable, DataTableBody, DataTableCell, DataTableDash, DataTableFooter,
  DataTableHeadCell, DataTableHeader, DataTableNote, DataTableNotice, DataTableRow,
  DataTableSelect, DataTableSkeleton, DataTableStack,
};
