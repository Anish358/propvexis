/* data-table.jsx
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is Cycle 00's
 *   centrepiece and it is on the Test page for exactly that reason. Approval is never
 *   inferred (§1); this line changes when the owner says so, not when the file is used.
 */

import React from 'react';
import { AlignLeft, ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
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
 * PanelTableHead's exact recipe (12px semibold `--text-2` on `--control-bg`), so the two
 * read as one family even though they are two objects.
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
 * `cols` and `minColWidth` are the FIXED-LAYOUT floor, kept from the shipped table with
 * its reason intact: `table-layout: fixed` divides the width evenly across however many
 * columns are visible, so no column can claim more room than another because of what
 * happens to be in its cells. The old Comments column swallowing the table is what
 * bought that rule. The floor is per-column rather than a flat pixel count, so the
 * thirteen default columns fit a normal desktop while all twenty-one still stay legible
 * and scroll.
 *
 * It is a PROP because it is a caller-supplied dimension — see ALIGN above.
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

function DataTable({
  cols, minColWidth = 92, scroll = 'page', stickyTop = 'var(--topbar-h, 50px)',
  className, style, children, ...rest
}) {
  const pageScroll = scroll !== 'self';
  const min = cols ? `${cols * minColWidth}px` : undefined;
  return (
    <div
      data-slot="data-table-shell"
      data-scroll={scroll}
      // See the block above. `overflow-x-auto` in both axes is what breaks a sticky head.
      className={cn('w-full', CONTAINER[scroll] || CONTAINER.page, className)}
      style={{ '--pv-table-sticky-top': pageScroll ? stickyTop : '0px', ...style }}
      {...rest}
    >
      <Table
        className="table-fixed border-separate border-spacing-0"
        style={{ minWidth: min }}
      >
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
 * `sort` IS BUILT AND THE TRADE LOG WILL NOT USE IT YET. The brief asks for sorting;
 * the product has none — no `ORDER BY` the client can choose in `routes/trades.js`, no
 * sort state in `TradeLog.jsx`. §2 and the review checklist are explicit that a mockup
 * must not add a control the product cannot honour, so the affordance lives in the KIT,
 * where it costs nothing, and stays off on the SCREEN until sorting is a feature. Left
 * as an open question for the review rather than quietly shipped or quietly dropped.
 *
 * The glyph is `ChevronsUpDown` when a column is sortable but unsorted, and it FADES IN
 * on hover rather than being absent — §14: "a hover affordance fades, it does not
 * unmount", because a header that reflows under the pointer is harder to click. Its
 * keyboard twin is `group-focus-within`, which the same section requires and which the
 * shipped table's selection column does not have. */
function DataTableHeadCell({
  align = 'left', narrow = false, sort = null, sortable = false, onSort,
  className, children, ...rest
}) {
  const Glyph = SORT_ICON[sort] || ChevronsUpDown;
  const interactive = sortable || Boolean(onSort);
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
        'text-xs leading-[14px] font-semibold text-[var(--text-2)]',
        narrow ? 'w-11 px-0' : 'px-3',
        ALIGN[align] || ALIGN.left,
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
            JUSTIFY[align],
          )}
        >
          {children}
          <Glyph
            aria-hidden="true"
            className={cn(
              'size-3 shrink-0 transition-opacity duration-[var(--dur-fast)]',
              sort
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-60 group-focus-within:opacity-60',
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

function DataTableRow({
  selected = false, interactive = false, tone, className, children, ...rest
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
 * `tone` IS THE TRADER'S MONEY AND IT IS ALLOWED TO FILL THE CELL. §17 reserves the
 * surface for data colour explicitly. Breakeven is BLUE rather than grey — grey read as
 * "no data" beside the green and red rows, when in fact the trade closed flat, which is
 * a result. */
const CELL_TONE = {
  profit: 'bg-[var(--profit-bg)] text-[var(--profit)]',
  loss: 'bg-[var(--loss-bg)] text-[var(--loss)]',
  be: 'bg-[var(--be-bg)] text-[var(--be)]',
  muted: 'text-[var(--muted)]',
};

function DataTableCell({
  align, numeric = false, narrow = false, tone, className, children, ...rest
}) {
  // A figure defaults to CENTRED — see the block above. `align="right"` is the opt-in
  // for the columns that are read down rather than across.
  const a = align || (numeric ? 'center' : 'left');
  return (
    <TableCell
      data-slot="data-table-cell"
      className={cn(
        HAIRLINE,
        'h-[37px] py-2 align-middle',
        narrow ? 'w-11 px-0 text-center' : 'px-3',
        'truncate text-sm text-[var(--text-body)]',
        numeric && 'font-mono tabular-nums',
        ALIGN[a] || ALIGN.left,
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
 * 2. IT FADES IN, AND IT HAS A KEYBOARD TWIN. A box on every one of four hundred rows
 *    is noise, so it is revealed by the row. The shipped table reveals it on
 *    `tr:hover` and on the box's own `:focus-visible` — which means tabbing INTO the row
 *    (a link, a button) reveals nothing. §14 requires `group-hover` AND
 *    `group-focus-within`; both are here. Opacity, not display, so revealing one does
 *    not shift the row, and a TICKED box always shows because hiding it would hide the
 *    selection itself.
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
          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
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
 * the glyph already wears. `group-focus-within` is its keyboard twin. */
function DataTableNote({ label = 'Has a note', className, ...rest }) {
  return (
    <span
      data-slot="data-table-note"
      aria-label={label}
      className={cn(
        'inline-flex text-[var(--text-2)] transition-colors duration-[var(--dur-fast)]',
        'group-hover:text-[var(--text)] group-focus-within:text-[var(--text)]',
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
  DataTable, DataTableBody, DataTableCell, DataTableDash, DataTableHeadCell,
  DataTableHeader, DataTableNote, DataTableNotice, DataTableRow, DataTableSelect,
  DataTableSkeleton, DataTableStack,
};
