/* KitDataTable — the Cycle 00 review specimens for the data table. DEV ONLY.
 *
 * Rendered by PrimitiveReview (`/test`). The kit is reviewed the way the primitives were:
 * as the REAL component in the real cascade, not as a drawing. A mockup cannot show a
 * bridge re-meaning (§25), a utility that compiles to nothing outside `components/`, or a
 * sticky header that a scroll container silently kills — all three are in this
 * component's history.
 *
 * ── THE FIRST SPECIMEN IS THE TRADE LOG, NOT A REVIEW CARD (owner, 2026-09-09) ────────
 *
 * The parity pane came first and the owner could not see the table for the apparatus
 * around it — a heading, two pane labels, a six-difference note. "I want to see the table
 * built separately, as it will be seen in the tradelog page."
 *
 * THEY WERE ALSO RIGHT ABOUT THE COLUMNS. It was rendering fifteen: the thirteen defaults
 * plus SL Size and Rules, which I had switched on because they carry the missing value and
 * the hover reason. Fifteen overflows the page and thirteen does not, so the first thing
 * the owner saw was a table scrolling sideways in a way the real page never does. The
 * extra two moved to the parity pane, where a comparison is the point.
 *
 * So `TradeLogPreview` renders exactly what the page renders — `.panel.log-panel` is a
 * card with `padding: 0` and the table flush inside it, at the page's real width, header
 * sticky to the top bar — and nothing else. The review apparatus lives BELOW it.
 *
 * INLINE STYLES for the scaffolding, per this page's rule: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written here emits NOTHING. The
 * specimens themselves are the real primitives, which is where the appearance lives.
 */
import React, { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  Alert, AlertDescription, AlertTitle, Badge, Button, ButtonLabel,
  DataTable, DataTableBody, DataTableCell, DataTableDash, DataTableHeadCell,
  DataTableHeader, DataTableNote, DataTableNotice, DataTableRow, DataTableSelect,
  DataTableFooter, DataTableSkeleton, DataTableStack, EmptyState,
  PanelCard, PanelHead, PanelMeta, Switch,
} from '@/components/primitives';
import TradesTable from '../trades/TradesTable.jsx';
import { fmtDayShort, fmtNum, fmtTime, RULE_LABEL } from '../../lib/constants.js';
import { fmtMoney, tradeOutcome } from '../../lib/metrics.js';

/* ── THE DATA ───────────────────────────────────────────────────────────────────────
 *
 * Brief §5: never lorem, never round numbers. A trader with three accounts and ~400
 * closed trades at a win rate near 54%; these are six of them, chosen so every cell type
 * and every awkward case is on screen at once:
 *
 *   · a win, a loss and a BREAKEVEN, because breakeven is blue and not grey
 *   · a missing SL, a missing setup, a missing probability — three different dashes
 *   · a comment long enough that printing it inline would set the column's width
 *   · an adherence cell reading "Broke: max SL, session"
 *   · an untagged row, which is the one row state that carries a tone
 *   · a five-decimal FX price beside a five-figure index price, so the tabular figures
 *     have something to line up
 */
const D = (day, h, m) => `2026-09-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;

const TRADES = [
  {
    id: 4187, close_time: D(8, 16, 42), open_time: D(8, 14, 5), direction: 'buy',
    session: 'London', symbol_base: 'XAUUSD', symbol: 'XAUUSD.pro',
    entry_price: 3412.55, exit_price: 3427.9, volume: 0.42, sl_size_pips: 18.5,
    mfe_pips: 24.1, max_r: 1.82, setup: 'Break & Retest', probability: 'A+',
    fixed_r: 1.8, pnl_money: 1247.3, commission: -8.4, tagged: true,
    comments: 'Clean London open sweep of the Asian high, waited for the retest and took the second entry. Held to the 1.8R target instead of trailing — the runner was there but the rule says target.',
    adherence: { status: 'followed' },
  },
  {
    id: 4186, close_time: D(8, 14, 3), open_time: D(8, 13, 51), direction: 'sell',
    session: 'London', symbol_base: 'EURUSD', symbol: 'EURUSD',
    entry_price: 1.09384, exit_price: 1.09461, volume: 1.5, sl_size_pips: 7.7,
    mfe_pips: 2.4, max_r: 0.31, setup: 'Liquidity Grab', probability: 'B',
    fixed_r: -1, pnl_money: -430, commission: -12, tagged: true,
    comments: null,
    adherence: { status: 'broken', brokenRules: ['max_sl', 'session'] },
  },
  {
    id: 4185, close_time: D(7, 20, 18), open_time: D(7, 19, 2), direction: 'buy',
    session: 'New York', symbol_base: 'US30', symbol: 'US30.cash',
    entry_price: 41287.4, exit_price: 41402.8, volume: 0.2, sl_size_pips: null,
    mfe_pips: 141.2, max_r: 2.44, setup: null, probability: 'A',
    fixed_r: 0.42, pnl_money: 291.6, commission: -3.2, tagged: false,
    comments: 'No stop on the platform — mental stop only. Do not repeat.',
    adherence: { status: 'unassessed' },
  },
  {
    id: 4184, close_time: D(7, 11, 27), open_time: D(7, 9, 40), direction: 'sell',
    session: 'Asia', symbol_base: 'GBPJPY', symbol: 'GBPJPY',
    entry_price: 198.412, exit_price: 198.409, volume: 0.6, sl_size_pips: 22,
    mfe_pips: 9.8, max_r: 0.44, setup: 'Range Fade', probability: 'C',
    fixed_r: 0, pnl_money: -1.8, commission: -4.8, tagged: true,
    comments: null,
    adherence: { status: 'followed' },
  },
  {
    id: 4183, close_time: D(5, 17, 55), open_time: D(5, 16, 12), direction: 'buy',
    session: 'New York', symbol_base: 'XAUUSD', symbol: 'XAUUSD.pro',
    entry_price: 3388.1, exit_price: 3401.45, volume: 0.35, sl_size_pips: 15.2,
    mfe_pips: 19.4, max_r: 1.28, setup: 'Break & Retest', probability: 'A+',
    fixed_r: 1.24, pnl_money: 862.15, commission: -7, tagged: true,
    comments: 'Textbook.', adherence: { status: 'followed' },
  },
  {
    id: 4182, close_time: D(5, 10, 9), open_time: D(5, 10, 4), direction: 'sell',
    session: 'London', symbol_base: 'EURUSD', symbol: 'EURUSD',
    entry_price: 1.09117, exit_price: 1.09203, volume: 2, sl_size_pips: 8.6,
    mfe_pips: 1.1, max_r: 0.12, setup: 'Liquidity Grab', probability: null,
    fixed_r: -1, pnl_money: -430, commission: -16, tagged: true,
    comments: null, adherence: { status: 'norules' },
  },
];

const OUTCOME_LABEL = { win: 'Win', loss: 'Loss', be: 'BE' };
const TONE = { win: 'profit', loss: 'loss', be: 'brand' };
/* BREAKEVEN IS `brand`, AND THAT IS OPEN QUESTION B FROM THE BRIEF SHOWING ITSELF.
 * Badge's tones are neutral · brand · profit · loss · warn · ai. There is no `be`, so a
 * flat trade borrows the blue one — whose value (`--blue-400`) is exactly what `--be`
 * resolves to, so it draws correctly and READS wrong in the code. The brief flagged Badge
 * as blocked on the §4 domain-ring decision and said converting it could defer to Cycle
 * 01. This is the cell that will want a `be` tone when it does. */
const fmtPrice = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 5 });
const GRADE = { 'A+': 4, A: 3, B: 2, C: 1 };

/* ── THE COLUMN SPEC ────────────────────────────────────────────────────────────────
 *
 * An array, not thirteen hand-written pairs of JSX, and that is how the real page does it
 * too: `tradeColumns.js` is plain data precisely so it can be asserted directly, and a
 * header and its cell have to be defined together or they drift.
 *
 * `align` is a PROP on every cell — §1, because a utility written in this file compiles
 * to nothing. `numeric` means TABULAR FIGURES; `align: 'right'` is the separate opt-in for
 * a RESULT read down the column rather than a measurement read across the row (owner,
 * 2026-09-09).
 *
 * THIRTEEN, WHICH IS THE TRADE LOG'S REAL DEFAULT VIEW, in its real order:
 *   ☐ · Date & Time · Symbol · Type · Session · Entry · Exit · Volume · Setup ·
 *   Probability · Status · Net P&L · Notes
 * A trader can switch on eight more in Trade Settings; at twenty-one the table scrolls,
 * which is what the per-column minimum width exists for. SL Size and Rules are two of
 * those eight and appear only in the parity pane — see this file's header.
 */
const COLUMNS = [
  {
    id: 'datetime', width: 100, label: 'Date & Time', sort: (t) => t.close_time,
    cell: (t) => <DataTableStack sub={fmtTime(t.close_time)}>{fmtDayShort(t.close_time)}</DataTableStack>,
  },
  {
    id: 'pair', width: 90, label: 'Symbol', sort: (t) => t.symbol_base,
    cell: (t) => <Badge>{t.symbol_base}</Badge>,
  },
  {
    id: 'type', width: 68, label: 'Type', sort: (t) => t.direction,
    cell: (t) => (
      <Badge tone={t.direction === 'sell' ? 'loss' : 'profit'}>
        {t.direction === 'sell' ? 'Sell' : 'Buy'}
      </Badge>
    ),
  },
  {
    id: 'session', width: 96, label: 'Session', sort: (t) => t.session,
    cell: (t) => <Badge>{t.session}</Badge>,
  },
  {
    id: 'entry', width: 92, label: 'Entry', numeric: true, align: 'center', sort: (t) => t.entry_price,
    cell: (t) => fmtPrice(t.entry_price),
  },
  {
    id: 'exit', width: 92, label: 'Exit', numeric: true, align: 'center', sort: (t) => t.exit_price,
    cell: (t) => fmtPrice(t.exit_price),
  },
  {
    id: 'volume', width: 76, label: 'Volume', numeric: true, align: 'center', sort: (t) => t.volume,
    cell: (t) => fmtNum(t.volume, 2),
  },
  {
    id: 'setup', width: 136, label: 'Setup', sort: (t) => t.setup || '',
    cell: (t) => (t.setup ? <Badge>{t.setup}</Badge> : <DataTableDash />),
  },
  {
    id: 'probability', width: 84, label: 'Probability', align: 'center', sort: (t) => GRADE[t.probability] || 0,
    cell: (t) => (t.probability ? <Badge>{t.probability}</Badge> : <DataTableDash />),
  },
  {
    id: 'status', width: 80,
    label: 'Status',
    align: 'center',
    sort: (t, unit) => tradeOutcome(t, unit) || '',
    cell: (t, unit) => {
      const out = tradeOutcome(t, unit);
      return out ? <Badge tone={TONE[out]}>{OUTCOME_LABEL[out]}</Badge> : <DataTableDash />;
    },
  },
  {
    /* THE ONE RIGHT-ALIGNED COLUMN (owner, 2026-09-09). A result is read DOWN the table
     * to answer "which of these is big", so its decimal points and minus signs have to
     * line up. The measurements above are read ACROSS, against their own row. */
    id: 'result', width: 108,
    label: 'Net P&L',
    numeric: true,
    align: 'right',
    sort: (t, unit) => (unit === 'USD' ? t.pnl_money : t.fixed_r),
    tone: (t, unit) => TONE[tradeOutcome(t, unit)],
    cell: (t, unit) => {
      const v = unit === 'USD' ? t.pnl_money : t.fixed_r;
      if (v == null) return <DataTableDash />;
      return unit === 'USD' ? fmtMoney(v, { sign: true }) : fmtNum(v);
    },
  },
  {
    /* A NOTE IS AN ICON. The first row's comment is three sentences long — printing it
     * inline made this column as wide as all the others put together, which is why the
     * shipped table marks it too. The glyph brightens with the row's hover AND its focus.
     * Not sortable: "has a note" is a yes/no, and sorting by one is really a filter. */
    id: 'comments', width: 62, label: 'Notes', align: 'center',
    cell: (t) => (t.comments ? <DataTableNote /> : <DataTableDash />),
  },
];

/* The two optional columns the PARITY pane wants and the Trade Log preview does not: they
 * carry the missing value and the hover reason, which a comparison needs and a
 * "what ships" view should not invent. Slotted where `tradeColumns.js` puts them. */
const SL = {
  id: 'sl', width: 84, label: 'SL Size', numeric: true, align: 'center', sort: (t) => t.sl_size_pips ?? -1,
  cell: (t) => (t.sl_size_pips == null ? <DataTableDash /> : fmtNum(t.sl_size_pips, 1)),
};
const RULES = {
  id: 'adherence', width: 112, label: 'Rules', sort: (t) => t.adherence?.status || '',
  cell: (t) => {
    const broke = (t.adherence?.brokenRules || []).map((r) => RULE_LABEL[r] || r);
    if (t.adherence?.status === 'followed') {
      return <Badge tone="profit" title="Followed every evaluable rule">Followed</Badge>;
    }
    if (t.adherence?.status === 'broken') {
      return (
        <Badge tone="warn" title={`Broke: ${broke.join(', ')}`}>
          {broke.length === 1 ? broke[0] : `${broke.length} rules`}
        </Badge>
      );
    }
    return <DataTableDash />;
  },
};
const WITH_OPTIONAL = [
  ...COLUMNS.slice(0, 7), SL, ...COLUMNS.slice(7, 9), RULES, ...COLUMNS.slice(9),
];

/* THE SELECTION GUTTER. 36px, down from the shipped 44px — the owner asked for the box
 * closer to Date & Time. It holds a 16px box, so 36 leaves 10px each side. */
const SELECT_W = 36;

/* WIDTHS ARE PER COLUMN NOW, AND THEY WERE NOT (owner, 2026-09-09). `table-fixed` splits
 * evenly unless told otherwise, so "Type" — holding the word "Sell" — had exactly as much
 * room as "Setup", holding "Break & Retest", which truncated. Each number below is the
 * content it has to fit; they sum to the table's honest minimum, and any surplus is shared
 * out in proportion, so these are ratios rather than a layout that breaks at another
 * width. Read them off the spec so a column and its width cannot drift apart. */
const widthsFor = (columns) => [SELECT_W, ...columns.map((c) => c.width)];

/* ── THE TABLE ──────────────────────────────────────────────────────────────────────
 *
 * Assembled from the primitives the way a screen will assemble it in Cycle 01. Note what
 * this file does NOT do: no width, no alignment and no column template written as a
 * class. `cols`, `align`, `numeric` and `narrow` are props (§1).
 *
 * The sort is client-side over the rows already in hand, which is all the kit's
 * affordance ever implies — see `TradeLogPreview` for why it is off on the real page.
 */
function KitTable({
  columns = COLUMNS, trades, state = 'ready', unit = 'R',
  selected, onToggle, onToggleAll, flashId, scroll = 'self', maxHeight,
}) {
  const [sort, setSort] = useState(null);
  const sel = selected || new Set();
  const here = trades.reduce((n, t) => n + (sel.has(t.id) ? 1 : 0), 0);
  const all = trades.length > 0 && here === trades.length;
  const cols = columns.length + 1;

  /* NO `sortable` GATE ANY MORE (owner, 2026-09-09): sorting is part of the component and
   * always on, so a column sorts iff its spec gives it a `sort` function. The gate existed
   * while sorting was a switch, and it had to exist then — turning the switch off left the
   * previous sort APPLIED, so a pane claiming to be "the Trade Log as it ships" showed
   * rows ordered by Net P&L. With no switch there is no such state to get wrong. */
  const rows = useMemo(() => {
    if (!sort) return trades;
    const col = columns.find((c) => c.id === sort.id);
    if (!col || !col.sort) return trades;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...trades].sort((a, b) => {
      const x = col.sort(a, unit);
      const y = col.sort(b, unit);
      if (x === y) return 0;
      return (x > y ? 1 : -1) * dir;
    });
  }, [trades, sort, columns, unit]);

  // Three clicks: descending, ascending, then cleared. "No sort" is a real state and a
  // trader who has sorted by mistake needs a way back to the log's own order.
  const toggleSort = (id) => setSort((s) => {
    if (!s || s.id !== id) return { id, dir: 'desc' };
    if (s.dir === 'desc') return { id, dir: 'asc' };
    return null;
  });

  return (
    <DataTable
      cols={cols}
      widths={widthsFor(columns)}
      scroll={scroll}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <DataTableHeader>
        <tr>
          <DataTableHeadCell narrow>
            <DataTableSelect
              always
              label="Select all trades"
              checked={all}
              indeterminate={here > 0 && !all}
              onCheckedChange={onToggleAll}
            />
          </DataTableHeadCell>
          {columns.map((c) => (
            /* THE HEAD TAKES THE SAME TWO VALUES AS THE BODY CELL BELOW IT — `align`
               and `numeric` — and the component resolves them once. It briefly took
               nothing, on a "headings are always centred" rule that never rendered:
               `align` had a default parameter, so the centred fallback was unreachable
               and every header came out left. Owner, 2026-09-09: the header follows its
               column. */
            <DataTableHeadCell
              key={c.id}
              align={c.align}
              numeric={c.numeric}
              sort={sort && sort.id === c.id ? sort.dir : null}
              onSort={c.sort ? () => toggleSort(c.id) : undefined}
            >
              {c.label}
            </DataTableHeadCell>
          ))}
        </tr>
      </DataTableHeader>

      {state === 'loading' ? <DataTableSkeleton cols={cols} rows={6} label="Loading trades" /> : null}

      {state === 'ready' ? (
        <DataTableBody>
          {rows.map((t) => (
            <DataTableRow
              key={t.id}
              interactive
              selected={sel.has(t.id)}
              tone={t.tagged ? undefined : 'attention'}
              flash={t.id === flashId}
              onClick={() => {}}
              title={t.tagged ? 'Edit tags' : 'Click to tag this trade'}
            >
              <DataTableCell narrow>
                <DataTableSelect
                  label={`Select trade ${t.id}`}
                  checked={sel.has(t.id)}
                  onCheckedChange={(on) => onToggle && onToggle(t.id, on)}
                />
              </DataTableCell>
              {columns.map((c) => (
                <DataTableCell
                  key={c.id}
                  align={c.align}
                  numeric={c.numeric}
                  tone={c.tone ? c.tone(t, unit) : undefined}
                >
                  {c.cell(t, unit)}
                </DataTableCell>
              ))}
            </DataTableRow>
          ))}
        </DataTableBody>
      ) : null}

      {state === 'empty' ? (
        <DataTableBody>
          <DataTableNotice colSpan={cols}>
            <EmptyState
              title="No trades yet"
              description="Close a trade in MT5 and it appears here instantly."
            />
          </DataTableNotice>
        </DataTableBody>
      ) : null}

      {state === 'error' ? (
        <DataTableBody>
          <DataTableNotice colSpan={cols}>
            <Alert variant="error">
              <AlertTitle>Could not load trades</AlertTitle>
              <AlertDescription>
                The request timed out. Your trades are safe — this is a display problem.
              </AlertDescription>
            </Alert>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" size="sm">
                <RefreshCw aria-hidden="true" />
                <ButtonLabel>Try again</ButtonLabel>
              </Button>
            </div>
          </DataTableNotice>
        </DataTableBody>
      ) : null}
    </DataTable>
  );
}

/* ── SCAFFOLDING ───────────────────────────────────────────────────────────────────── */

const F = {
  card: {
    border: '1px solid var(--line)', borderRadius: 14,
    background: 'var(--surface)', overflow: 'hidden', marginTop: 16,
  },
  head: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: '13px 18px', borderBottom: '1px solid var(--line)',
    background: 'var(--control-bg)',
  },
  name: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  mono: { fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11.5, color: 'var(--text-3)' },
  note: {
    padding: '11px 18px', borderTop: '1px solid var(--line-inset)',
    background: 'var(--surface-sunken)', fontSize: 12.5, lineHeight: '20px', color: 'var(--text-2)',
  },
  paneLabel: {
    fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontWeight: 500, padding: '12px 18px 0',
  },
  pane: { padding: '10px 18px 18px', minWidth: 0 },
  tabs: { display: 'flex', gap: 6, padding: '12px 18px 0' },
  tab: (on) => ({
    height: 26, padding: '0 11px', borderRadius: 99, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--line-chip)' : 'transparent'}`,
    background: on ? 'var(--control-bg-strong)' : 'transparent',
    color: on ? 'var(--text)' : 'var(--text-3)', fontSize: 12, fontWeight: 500,
  }),
  strong: { color: 'var(--text)', fontWeight: 600 },

  /* `.panel.log-panel` RESTATED IN INLINE STYLE, and it is a restatement rather than a
   * reuse on purpose. The real class is `background: var(--panel); border: 1px solid
   * var(--line); border-radius: var(--r-2xl); box-shadow: var(--sh-1)` plus `padding: 0`
   * from `.log-panel`. Writing `className="panel log-panel"` here would drag in the six
   * `.log-panel .log-grid` descendant rules with it — which style the SHIPPED table's
   * corners — so the preview would be half legacy CSS and the comparison worthless.
   * Same values, none of the descendants. `--r-card` rather than `--r-2xl`: the legacy
   * token still holds 24px for the old shells, but new work reads the card token.
   *
   * ⚠ NO `overflow: hidden`, AND THAT IS THE BUG THE OWNER CAUGHT. It was here to clip
   * the table's square corners to the card's rounded ones — which made the card a scroll
   * container, which made it the sticky header's containing block, so the header pinned
   * 50px INSIDE the card and floated over the second row. `.panel` has no overflow rule
   * for exactly this reason; the table rounds its own outer cells instead (`flush`). */
  logPanel: {
    background: 'var(--panel)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-card)', boxShadow: 'var(--sh-1)',
    padding: 0,
  },
  bare: {
    fontSize: 12.5, lineHeight: '20px', color: 'var(--text-3)',
    margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
  },
  toggle: { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
  split: {
    display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 16,
  },
  asideNote: {
    flex: '1 1 320px', minWidth: 300, fontSize: 12.5, lineHeight: '20px',
    color: 'var(--text-2)', paddingTop: 4,
  },
};

/* ═════════════════════════════════════════════════ THE TRADE LOG, AS THE PAGE SHIPS IT ══
 *
 * ── IT IS A `PanelCard`, AND THE OWNER CHOSE THAT FIT (2026-09-09) ────────────────────
 *
 * It was a bare panel with the table flush to its edges, which is what `.panel.log-panel`
 * does today. Seeing it beside the review panes — which are cards with a titled head and
 * their content inset — the owner preferred those: "I like this type of fit better. The
 * thing that actually changes in the actual page would be the top header saying
 * 'Selection — the header box…' with something like Trade Log."
 *
 * So this is the DASHBOARD'S OWN CARD rather than my dev scaffolding: `PanelCard` and
 * `PanelHead` are approved primitives, visible on the locked dashboard, and using them
 * is what makes the Trade Log look cut from it rather than approximately like it. The
 * scaffolding cards below are still inline styles, because those are review apparatus and
 * never ship.
 *
 * ITS CORNERS ARE SQUARE (owner, 2026-09-09). They were briefly rounded — 18px, one step
 * inside the card per §6 trap 3 — and the owner chose straight. Inset in a padded card
 * the table never meets the card's curve anyway, so the radius was answering a question
 * the layout had already closed.
 *
 * THE HEAD DOES NOT REPEAT THE TOP BAR (owner, 2026-09-09). It said "Trade Log", which the
 * page's top bar already says — §24, "do not say the same thing twice". It now carries
 * three facts the chrome does not: WHAT the rows are, WHICH ones (the active scope), and
 * HOW MANY the filters left. The count doubles as the selection readout.
 *
 * SORTING IS PERMANENT AND HAS NO SWITCH (owner, 2026-09-09), and the sequence of that
 * decision is worth keeping because I misread the middle step.
 *
 * It started as "the affordance lives in the kit and stays off on the screen", right
 * under §2 — the product has no sort, and a control the product cannot honour must not
 * appear. Then: "I want sorting in the app too", which I took as a Cycle 01 request and
 * pushed back on, since /trades still renders the legacy table. The owner meant something
 * narrower: "when this kit replaces the current one, with that I want sorting on — remove
 * the toggle and keep it permanently on."
 *
 * WHICH IS BOTH SIMPLER AND STILL §2-SAFE. Nothing is added to a page the product cannot
 * honour, because no page has changed; the component simply carries sorting, so the Trade
 * Log gains it as a CONSEQUENCE of migrating rather than as separate feature work. And
 * with no switch there is no "off" state to leave a stale sort applied in — which is a bug
 * the switch actually had.
 *
 * The one control left is R / money, because Net P&L is the column whose alignment was
 * just ruled on and it is worth seeing both.
 */
export function TradeLogPreview() {
  const [selected, setSelected] = useState(() => new Set());
  const [unit, setUnit] = useState('R');

  const toggle = (id, on) => setSelected((s) => {
    const next = new Set(s);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAll = (on) => setSelected(on ? new Set(TRADES.map((t) => t.id)) : new Set());

  return (
    <div>
      <PanelCard>
        {/* NOT "TRADE LOG" (owner, 2026-09-09). The page's top bar already says that, and
            §24 is "do not say the same thing twice". Three facts here, none of them a
            duplicate: WHAT the rows are (the top bar names the page, not its contents),
            WHICH ones you are looking at, and HOW MANY the filters left.

            ⚠ THE SUB HAS TO BE DERIVED IN CYCLE 01. It is the active scope — account and
            period — and it is hardcoded here because this is a specimen. On the real page
            it must read the account switcher and the date filter, or it becomes a label
            that confidently describes rows it is not showing. §15: never invent a value to
            fill a state; a stale scope is worse than no scope. */}
        <PanelHead
          sub="FTMO $100,000 · September 2026"
          meta={(
            <PanelMeta label={selected.size > 0 ? 'selected' : 'trades'}>
              {selected.size > 0 ? `${selected.size} of ${TRADES.length}` : TRADES.length}
            </PanelMeta>
          )}
        >
          Closed trades
        </PanelHead>
        <KitTable
          trades={TRADES}
          unit={unit}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          scroll="page"
        />
      </PanelCard>
      <p style={F.bare}>
        <span>
          Thirteen columns — the Trade Log&rsquo;s default view. The header sticks as you
          scroll, and every column with an order sorts: click, click again to reverse, a
          third time to clear.
        </span>
        <span style={{ flex: 1 }} />
        <label style={F.toggle}>
          <Switch
            checked={unit === 'USD'}
            onCheckedChange={(v) => setUnit(v ? 'USD' : 'R')}
            aria-label="Show money instead of R"
          />
          <span>{unit === 'USD' ? 'Money' : 'R'}</span>
        </label>
      </p>
    </div>
  );
}

/* THE COLUMN-HEADER SIZE WAS DECIDED HERE AND THE PANE IS GONE (owner, 2026-09-09).
 *
 * Four candidates rendered over the same rows — 12/600 (the dashboard's number), 14/500
 * (its ratio), 13/600 (what ships) and 12/500 (lighter, same size). B won. The pane is
 * deleted rather than kept, because a "pick one" that opens on a losing variant is a
 * specimen showing the wrong thing to whoever looks next; the reasoning that matters
 * survives in `data-table.jsx` beside the value it produced.
 *
 * The finding worth carrying forward: the header was wrong because it copied the
 * dashboard's ABSOLUTE size onto a table with a different body size. Any other piece that
 * borrows a value from the dashboard should check the ratio it sat in, not just the
 * number. */

/* ══════════════════════════════════════════ THE SAME TABLE, AS A SUMMARY (owner ask) ══
 *
 * "Make one more preview with the attached shadcn type table" — a card with a title, a
 * sub and a status badge, a short table whose first column is text and whose figures run
 * right, and a footer that totals itself.
 *
 * IT PROVES THE PIECE IS A KIT PIECE AND NOT A TRADE LOG. Cycle 00 exists so ~23 screens
 * are ASSEMBLED rather than designed, and a component only ever shown at thirteen columns
 * and four hundred rows has not shown it can serve the other eleven tables in this app —
 * Settings, Prop OS, Reports, the strategy comparison. Five rows in a narrow card is the
 * opposite end of the same component, and every difference is a PROP: no selection
 * column, no row interaction, a footer, four widths instead of thirteen.
 *
 * THE DATA IS REAL, NOT AN INVOICE. The reference was an invoice and this app has none —
 * inventing one would prove the table can render something the product will never ask of
 * it. What the product does have is `financeSummary`: fees out (evaluation / reset /
 * activation), payouts in (gross x split = the trader's take), and spent / earned / net.
 * Same shape as the reference, carrying figures a trader would recognise.
 *
 * THE FOOTER IS NEW. A trade log has no total, because the KPI row above it already
 * carries one and §24 forbids saying it twice. A cost-and-return breakdown is the
 * opposite: the rows exist FOR what they add up to.
 */
const LEDGER = [
  { item: 'Evaluation fee — FTMO $100k', kind: 'Fee', when: '02 Jun 26', amount: -540 },
  { item: 'Reset — after daily-loss breach', kind: 'Fee', when: '19 Jun 26', amount: -180 },
  { item: 'Activation — funded stage', kind: 'Fee', when: '04 Jul 26', amount: -139 },
  { item: 'Payout — $4,180 gross at 80%', kind: 'Payout', when: '31 Jul 26', amount: 3344 },
  { item: 'Payout — $2,065 gross at 80%', kind: 'Payout', when: '29 Aug 26', amount: 1652 },
];

const SUMMARY_COLUMNS = [
  { id: 'item', width: 260, label: 'Item' },
  { id: 'kind', width: 92, label: 'Type' },
  { id: 'when', width: 104, label: 'Date' },
  { id: 'amount', width: 116, label: 'Amount' },
];

export function DataTableSummary() {
  const spent = LEDGER.filter((r) => r.amount < 0).reduce((a, r) => a + r.amount, 0);
  const earned = LEDGER.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const net = earned + spent;

  return (
    <div style={F.split}>
      <div style={{ maxWidth: 620, flex: '1 1 560px' }}>
        <PanelCard>
          <PanelHead
            sub="FTMO $100,000 · funded 4 Jul 2026"
            meta={<Badge tone={net >= 0 ? 'profit' : 'loss'}>{net >= 0 ? 'In profit' : 'Down'}</Badge>}
          >
            Cost &amp; return
          </PanelHead>

          <DataTable widths={SUMMARY_COLUMNS.map((c) => c.width)} scroll="self">
            <DataTableHeader>
              <tr>
                {SUMMARY_COLUMNS.map((c) => (
                  <DataTableHeadCell key={c.id}>{c.label}</DataTableHeadCell>
                ))}
              </tr>
            </DataTableHeader>
            <DataTableBody>
              {LEDGER.map((r) => (
                <DataTableRow key={r.item}>
                  <DataTableCell>{r.item}</DataTableCell>
                  <DataTableCell align="center">
                    <Badge tone={r.amount < 0 ? 'neutral' : 'profit'}>{r.kind}</Badge>
                  </DataTableCell>
                  <DataTableCell align="center">{r.when}</DataTableCell>
                  <DataTableCell numeric align="right" tone={r.amount < 0 ? undefined : 'profit'}>
                    {fmtMoney(r.amount, { sign: true })}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
            {/* `colSpan` collapses the three label columns so a caption sits beside its
                figure. The reference does the same, and a caption stranded in the first
                column of a four-column row is a caption you have to trace across. */}
            <DataTableFooter>
              <tr>
                <DataTableCell colSpan={3} align="right" tone="label">
                  Spent on fees
                </DataTableCell>
                <DataTableCell numeric align="right">{fmtMoney(spent, { sign: true })}</DataTableCell>
              </tr>
              <tr>
                <DataTableCell colSpan={3} align="right" tone="label">
                  Earned in payouts
                </DataTableCell>
                <DataTableCell numeric align="right" tone="profit">
                  {fmtMoney(earned, { sign: true })}
                </DataTableCell>
              </tr>
              <tr>
                <DataTableCell colSpan={3} align="right" strong>
                  Net
                </DataTableCell>
                <DataTableCell numeric align="right" strong tone={net >= 0 ? 'profit' : 'loss'}>
                  {fmtMoney(net, { sign: true })}
                </DataTableCell>
              </tr>
            </DataTableFooter>
          </DataTable>
        </PanelCard>
      </div>

      <div style={F.asideNote}>
        <strong style={F.strong}>The same component, at the other end of its range. </strong>
        Five rows in a narrow card against thirteen columns and four hundred in a page —
        and every difference is a prop, not a second table: no selection column, no row
        click, a footer, four widths instead of thirteen.
        {' '}
        <strong style={F.strong}>That is what makes it a kit piece. </strong>
        Cycle 00 exists so the other ~23 screens are assembled rather than designed, and
        eleven of the twelve tables still hand-rolled in this app — Settings, Prop OS,
        Reports, the strategy comparison — look far more like this than like the Trade Log.
        {' '}
        <strong style={F.strong}>Two things to judge. </strong>
        The rule above the totals is one step stronger than the row hairlines, because it
        separates a sum from what it sums rather than one row from the next. And Net is the
        only weight in the table above regular — a total is the one figure in a summary you
        should be able to find first.
        {' '}
        The figures are real: fees are evaluation / reset / activation, a payout is gross
        &times; split, and spent / earned / net is what
        {' '}
        <code style={F.mono}>financeSummary</code>
        {' already computes. The reference was an invoice, and this app has none.'}
      </div>
    </div>
  );
}

/* THE PARITY PANE — ours above, the shipping table below, on the same rows and the same
 * FIFTEEN columns (the thirteen defaults plus SL Size and Rules, which carry the missing
 * value and the hover reason a comparison wants). Stacked rather than side by side: a
 * fifteen-column table squeezed into half the width is not the table either of them is,
 * and what is compared here is row height, hairline weight and how a column of figures
 * reads — all of which need the real width. */
export function DataTableParity() {
  const [selected, setSelected] = useState(() => new Set([4185]));

  const toggle = (id, on) => setSelected((s) => {
    const next = new Set(s);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAll = (on) => setSelected(on ? new Set(TRADES.map((t) => t.id)) : new Set());

  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>Side by side with the one that ships today</span>
        <span style={F.mono}>primitives/data-table.jsx vs features/trades/TradesTable.jsx</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>15 columns, so both scroll</span>
      </div>

      <div style={F.paneLabel}>Ours — @shadcn/table, base-rhea, wrapped</div>
      <div style={{ ...F.pane, overflowX: 'auto' }}>
        <KitTable
          columns={WITH_OPTIONAL}
          trades={TRADES}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      </div>

      <div style={{ ...F.paneLabel, borderTop: '1px solid var(--line-inset)', paddingTop: 16 }}>
        Today — hand-rolled &lt;table&gt; on legacy/app.css
      </div>
      <div style={{ ...F.pane, overflowX: 'auto' }}>
        <TradesTable
          trades={TRADES}
          onRowClick={() => {}}
          unit="R"
          columnOverrides={{ adherence: true, sl: true }}
          selected={selected}
          onSelect={toggle}
          onSelectAll={toggleAll}
        />
      </div>

      <div style={F.note}>
        <strong style={F.strong}>Six differences, and five of them are a token being read
        correctly rather than a taste. </strong>
        <strong style={F.strong}>1. The line between rows</strong>
        {' — today it is the card’s own edge, drawn four hundred times. §8 says a divider '}
        inside a surface that already has an edge is half that edge, which is
        {' '}
        <code style={F.mono}>--line-inset</code>
        {'. '}
        <strong style={F.strong}>2. Hover</strong>
        {' — the registry hovers to 50% of the hover token; §14 says hover intensifies, so ours '}
        uses it at full strength, the way every row on the dashboard does.
        {' '}
        <strong style={F.strong}>3. A selected row</strong>
        {' — the registry paints it the same colour as hover, so you could not tell which rows '}
        the bulk action would act on. Ours is one step up.
        {' '}
        <strong style={F.strong}>4. The header</strong>
        {' — 12px semibold on --control-bg, which is PanelTableHead’s exact recipe from the '}
        dashboard, so this table and the dashboard’s lists read as one family.
        {' '}
        <strong style={F.strong}>5. The untagged row</strong>
        {' — today its whole background goes warm. §17 puts a system colour on the glyph and the '}
        edge and never inside a data surface, because in a table red and green are your money.
        Ours marks it with a left edge instead.
        {' '}
        <strong style={F.strong}>6. Net P&amp;L is right-aligned. Nothing else is
        (your ruling, 9 Sep). </strong>
        A <em>measurement</em> — entry, exit, volume, SL — is read across, against its own
        row, and stays centred. A <em>result</em> is read down the column to answer
        &ldquo;which of these is big&rdquo;, and that only works when the decimal points
        and the minus signs line up.
      </div>
    </div>
  );
}

/* THE FOUR STATES — §15 asks for all four, and for the loading one to mirror the page in
 * the real shell at the real dimensions. That is why the skeleton is six real rows of real
 * cells at 37px under the real header rather than a grey block where the table will be:
 * when the trades land, nothing moves. Switch between them and watch for a jump. */
export function DataTableStates() {
  const [state, setState] = useState('loading');
  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>The four states, in the same shell</span>
        <span style={F.mono}>DataTableSkeleton · DataTableNotice + EmptyState · + Alert</span>
      </div>
      <div style={F.tabs}>
        {['ready', 'loading', 'empty', 'error'].map((s) => (
          <button key={s} type="button" style={F.tab(state === s)} onClick={() => setState(s)}>
            {s}
          </button>
        ))}
      </div>
      <div style={F.pane}>
        <KitTable trades={state === 'ready' ? TRADES : []} state={state} maxHeight={340} />
      </div>
      <div style={F.note}>
        <strong style={F.strong}>Click between the four and watch for movement. </strong>
        The header, the column widths and the row height are identical in all of them,
        which is the whole test — a state that resizes the table is a layout jump wearing a
        state’s clothes. The empty state is the approved
        {' '}
        <code style={F.mono}>EmptyState</code>
        {' and the error is the approved '}
        <code style={F.mono}>Alert</code>
        , not new drawings: what belongs in an empty state is a product decision, so the
        table supplies the cell and the screen supplies the sentence.
      </div>
    </div>
  );
}

/* Selection and hover are behaviours, not stills, so they get their own pane with the
 * instruction attached. This is the pane that answers §14's keyboard twin: the shipping
 * table reveals its box on `tr:hover` and on the box's own focus, so TABBING into a row
 * reveals nothing at all. */
export function DataTableSelection() {
  const [selected, setSelected] = useState(() => new Set([4186, 4183]));
  const toggle = (id, on) => setSelected((s) => {
    const next = new Set(s);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAll = (on) => setSelected(on ? new Set(TRADES.map((t) => t.id)) : new Set());
  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>Selection — the header box, and the keyboard</span>
        <span style={F.mono}>DataTableSelect · primitives/checkbox.jsx</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{`${selected.size} of ${TRADES.length} selected`}</span>
      </div>
      <div style={F.pane}>
        <KitTable
          trades={TRADES}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          maxHeight={340}
        />
      </div>
      <div style={F.note}>
        <strong style={F.strong}>Three things to try. </strong>
        <strong style={F.strong}>Look at the header box</strong>
        {' — two of six rows are selected, so it shows a DASH rather than a tick. shadcn '}
        ships no such state: it draws a tick whatever is selected, which is a lie about what
        a bulk action will do. The dash is the one thing in this checkbox that is ours.
        {' '}
        <strong style={F.strong}>Now press Tab</strong>
        {' from the address bar into the table without touching the mouse. Each row’s box '}
        appears as focus reaches it. Today it does not — the box is revealed by
        {' '}
        <code style={F.mono}>tr:hover</code>
        {' only, so the keyboard sees an empty column. '}
        <strong style={F.strong}>Then tick a box on a row</strong>
        {' and confirm it does NOT open the trade. The row is clickable and the cell inside it '}
        is too, which is the one interaction in this table that has to be got exactly right.
      </div>
    </div>
  );
}

/* THE ARRIVAL FLASH. A behaviour, so it needs a button rather than a still — you cannot
 * review a two-second animation from a screenshot. The button replays it on the top row,
 * which is what happens when a position closes in MT5 and the socket pushes it. */
export function DataTableArrival() {
  const [flashId, setFlashId] = useState(null);
  const replay = () => {
    setFlashId(null);
    // Two frames, not zero: React batches, so clearing and re-setting in one tick never
    // unsets the class and the animation does not restart.
    requestAnimationFrame(() => requestAnimationFrame(() => setFlashId(TRADES[0].id)));
  };
  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>A trade arriving from MT5</span>
        <span style={F.mono}>pv-row-flash · bridge.css</span>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={replay}>
          <RefreshCw aria-hidden="true" />
          <ButtonLabel>Play it again</ButtonLabel>
        </Button>
      </div>
      <div style={F.pane}>
        <KitTable trades={TRADES} flashId={flashId} maxHeight={340} />
      </div>
      <div style={F.note}>
        <strong style={F.strong}>Press the button and watch the top row. </strong>
        This is the behaviour that already ships — you approved keeping it. What changed is
        underneath: the keyframe moved out of the frozen legacy stylesheet into
        {' '}
        <code style={F.mono}>bridge.css</code>
        {' beside the app’s other five, and its green came off a legacy '}
        <code style={F.mono}>--tint-*</code>
        {' value onto '}
        <code style={F.mono}>--profit-bg</code>
        .
        {' '}
        <strong style={F.strong}>Two things to judge. </strong>
        Is two seconds right — long enough that you catch it after looking away at MT5,
        short enough not to nag? And is the green strong enough to find without being loud
        enough to read as a win? It is deliberately the same green a winning cell uses, so
        the row does not invent a sixth meaning for the colour.
      </div>
    </div>
  );
}

/* WHAT IS DECIDED AND WHAT IS LEFT. The answered ones stay listed, so the pane shows the
 * decisions rather than only the queue. */
export function DataTableQuestions() {
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>What you have decided, and what is left</span>
        <span style={{ flex: 1 }} />
      </div>
      <div style={F.note}>
        <strong style={F.strong}>1. Alignment — ANSWERED 9 Sep. </strong>
        Only results right-align (Net P&amp;L, and R when the unit is R); measurements stay
        centred. The rule is in the kit rather than the page, so the next table does not
        re-decide it.
        <br />
        <br />
        <strong style={F.strong}>2. Sorting — CLOSED 9 Sep. </strong>
        It is part of the component and permanently on: no flag, no toggle. Client-side
        over the rows already loaded, so no API change. The Trade Log gains it the day it
        migrates onto this table — as a consequence of the migration rather than as
        separate feature work, which is why nothing needs doing to /trades now.
        <br />
        <br />
        <strong style={F.strong}>3. Row height — ANSWERED 9 Sep. </strong>
        36px header over 37px rows. 36px is PanelTableHead&rsquo;s exact band height, so
        this header and the dashboard&rsquo;s card lists are the same object. Today&rsquo;s
        is 46px, so the header got tighter and the rows did not move.
        <br />
        <br />
        <strong style={F.strong}>4. The new-trade flash — BUILT, one rule still open. </strong>
        Its two seconds is not on §10&rsquo;s ladder of three durations. §10 sizes a
        duration by what MOVES; this one is sized by how long you take to look back at the
        browser after closing a position in MT5. The skeleton pulse already has that
        carve-out (&ldquo;a heartbeat, not an event&rdquo;) and this needs the same
        sentence. Drafted for you with the §1 amendment.
      </div>
    </div>
  );
}
