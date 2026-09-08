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
  DataTableSkeleton, DataTableStack, EmptyState, Switch,
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
    id: 'datetime', label: 'Date & Time', sort: (t) => t.close_time,
    cell: (t) => <DataTableStack sub={fmtTime(t.close_time)}>{fmtDayShort(t.close_time)}</DataTableStack>,
  },
  {
    id: 'pair', label: 'Symbol', sort: (t) => t.symbol_base,
    cell: (t) => <Badge>{t.symbol_base}</Badge>,
  },
  {
    id: 'type', label: 'Type', sort: (t) => t.direction,
    cell: (t) => (
      <Badge tone={t.direction === 'sell' ? 'loss' : 'profit'}>
        {t.direction === 'sell' ? 'Sell' : 'Buy'}
      </Badge>
    ),
  },
  {
    id: 'session', label: 'Session', sort: (t) => t.session,
    cell: (t) => <Badge>{t.session}</Badge>,
  },
  {
    id: 'entry', label: 'Entry', numeric: true, align: 'center', sort: (t) => t.entry_price,
    cell: (t) => fmtPrice(t.entry_price),
  },
  {
    id: 'exit', label: 'Exit', numeric: true, align: 'center', sort: (t) => t.exit_price,
    cell: (t) => fmtPrice(t.exit_price),
  },
  {
    id: 'volume', label: 'Volume', numeric: true, align: 'center', sort: (t) => t.volume,
    cell: (t) => fmtNum(t.volume, 2),
  },
  {
    id: 'setup', label: 'Setup', sort: (t) => t.setup || '',
    cell: (t) => (t.setup ? <Badge>{t.setup}</Badge> : <DataTableDash />),
  },
  {
    id: 'probability', label: 'Probability', align: 'center', sort: (t) => GRADE[t.probability] || 0,
    cell: (t) => (t.probability ? <Badge>{t.probability}</Badge> : <DataTableDash />),
  },
  {
    id: 'status',
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
    id: 'result',
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
    id: 'comments', label: 'Notes', align: 'center',
    cell: (t) => (t.comments ? <DataTableNote /> : <DataTableDash />),
  },
];

/* The two optional columns the PARITY pane wants and the Trade Log preview does not: they
 * carry the missing value and the hover reason, which a comparison needs and a
 * "what ships" view should not invent. Slotted where `tradeColumns.js` puts them. */
const SL = {
  id: 'sl', label: 'SL Size', numeric: true, align: 'center', sort: (t) => t.sl_size_pips ?? -1,
  cell: (t) => (t.sl_size_pips == null ? <DataTableDash /> : fmtNum(t.sl_size_pips, 1)),
};
const RULES = {
  id: 'adherence', label: 'Rules', sort: (t) => t.adherence?.status || '',
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
  selected, onToggle, onToggleAll, flashId, sortable = false, scroll = 'self', maxHeight,
}) {
  const [sort, setSort] = useState(null);
  const sel = selected || new Set();
  const here = trades.reduce((n, t) => n + (sel.has(t.id) ? 1 : 0), 0);
  const all = trades.length > 0 && here === trades.length;
  const cols = columns.length + 1;

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
    <DataTable cols={cols} scroll={scroll} style={maxHeight ? { maxHeight } : undefined}>
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
            <DataTableHeadCell
              key={c.id}
              align={c.align || (c.numeric ? 'center' : 'left')}
              sortable={sortable && Boolean(c.sort)}
              sort={sort && sort.id === c.id ? sort.dir : null}
              onSort={sortable && c.sort ? () => toggleSort(c.id) : undefined}
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
   * token still holds 24px for the old shells, but new work reads the card token. */
  logPanel: {
    background: 'var(--panel)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-card)', boxShadow: 'var(--sh-1)',
    overflow: 'hidden', padding: 0,
  },
  bare: {
    fontSize: 12.5, lineHeight: '20px', color: 'var(--text-3)',
    margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
  },
  toggle: { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
};

/* ═════════════════════════════════════════════════ THE TRADE LOG, AS THE PAGE SHIPS IT ══
 *
 * No review card, no heading, no note above it. `.page-body` > `.panel.log-panel` > the
 * table, at the real width, header sticky to the top bar, thirteen columns. Scroll the
 * page and the header should stay under the bar.
 *
 * THE TWO SWITCHES ARE THE ONLY APPARATUS, and each is here for a reason the owner asked
 * for directly.
 *
 * SORT was invisible because it was working as decided: it stays IN THE KIT and OFF ON
 * THE SCREEN, since the product has no sort — no sort state in `TradeLog.jsx`, no
 * orderable query in `routes/trades.js` — and §2 forbids a control the product cannot
 * honour. Off, this is the Trade Log. On, this is what the Trade Log becomes the day
 * sorting is a feature: click a header to sort, again to reverse, a third time to clear.
 * The chevron fades in on hover AND on focus, which is §14's keyboard twin.
 *
 * R / $ because the Net P&L column is the one that changes meaning with the display unit,
 * and it is the column whose alignment was just ruled on. Worth seeing both.
 */
export function TradeLogPreview() {
  const [selected, setSelected] = useState(() => new Set());
  const [sortable, setSortable] = useState(false);
  const [unit, setUnit] = useState('R');

  const toggle = (id, on) => setSelected((s) => {
    const next = new Set(s);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAll = (on) => setSelected(on ? new Set(TRADES.map((t) => t.id)) : new Set());

  return (
    <div>
      <div style={F.logPanel}>
        <KitTable
          trades={TRADES}
          unit={unit}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          sortable={sortable}
          scroll="page"
        />
      </div>
      <p style={F.bare}>
        <span>Thirteen columns — the Trade Log&rsquo;s default view. The header sticks as you scroll.</span>
        <span style={{ flex: 1 }} />
        <label style={F.toggle}>
          <Switch checked={sortable} onCheckedChange={setSortable} aria-label="Show the sort affordance" />
          <span>{sortable ? 'Sorting on — click a header' : 'Sorting off, as the page ships'}</span>
        </label>
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
        <strong style={F.strong}>2. Sorting — ANSWERED 9 Sep. </strong>
        In the kit, off on the screen, because the product has no sort. The switch under the
        preview at the top turns the affordance on so you can see what it becomes the day
        sorting is a real feature.
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
