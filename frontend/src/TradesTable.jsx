import React from 'react';
import { fmtDayShort, fmtTime, fmtNum, fmtDuration, slug, RULE_LABEL } from './constants.js';
import { fmtMoney, tradeOutcome } from './metrics.js';
import { TRADE_COLUMNS, colVisible } from './tradeColumns.js';

// Re-exported so existing importers (TradeSettingsModal) keep their path.
export { colVisible };

// Price formatting shared by the entry/exit price columns (mirrors TradePreview).
const fmtPrice = (v) => (v == null ? <span className="muted">—</span> : Number(v).toLocaleString('en-US', { maximumFractionDigits: 5 }));

function Pill({ value, kind }) {
  if (!value) return <span className="pill pill-empty">—</span>;
  return <span className={`pill ${kind}-${slug(value)}`}>{value}</span>;
}

const OUTCOME_LABEL = { win: 'Win', loss: 'Loss', be: 'BE' };

// Row selection. Hidden until the row is hovered (or the box is ticked — hiding a
// ticked box would hide the selection itself), and it must never open the row's
// preview panel, hence the stopPropagation on both the click and the change.
function RowCheck({ checked, onChange, label, indeterminate = false }) {
  const ref = React.useRef(null);
  // `indeterminate` is a DOM property, not an attribute, so React can't set it.
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={`row-check ${checked || indeterminate ? 'is-on' : ''}`}
      checked={checked}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.checked); }}
    />
  );
}

// A note is an ICON, not the prose. The comment can run to paragraphs, and printing
// it inline made one column as wide as all the others put together; the icon says
// "there is a note here", hovering reads it, and the row opens the full text.
function NoteMark({ text }) {
  if (!text) return <span className="muted">—</span>;
  return (
    <span className="cell-note" title={text} aria-label="Has a note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16M4 10h16M4 15h10" />
      </svg>
    </span>
  );
}

// Cell renderers, keyed by the column ids in tradeColumns.js. Each is a factory
// over the render context — the display unit and precision setting (a few cells
// read differently in R than in $) plus the selection handlers. WHICH columns
// exist, what they're called and which are on by default is the spec next door;
// this file only knows how to draw one.
const CELLS = {
  select: ({ isSelected, onSelect }) => (t) => (
    <td className="col-select">
      <RowCheck
        checked={isSelected(t.id)}
        onChange={(on) => onSelect(t.id, on)}
        label={`Select trade ${t.id}`}
      />
    </td>
  ),
  // Date over time, two lines: the pair reads as one timestamp without either
  // half competing for the row's width.
  datetime: () => (t) => (
    <td className="cell-dt">
      {fmtDayShort(t.close_time)}
      <span className="cell-time">{fmtTime(t.close_time)}</span>
    </td>
  ),
  duration: () => (t) => <td className="cell-dur">{fmtDuration(t.open_time, t.close_time) || <span className="muted">—</span>}</td>,
  type: () => (t) => (
    <td>{t.direction
      ? <span className={`pill dir-${slug(t.direction)}`}>{t.direction === 'sell' ? 'Sell' : 'Buy'}</span>
      : <span className="pill pill-empty">—</span>}
    </td>
  ),
  session: () => (t) => <td><Pill value={t.session} kind="session" /></td>,
  pair: () => (t) => <td><Pill value={t.symbol_base || t.symbol} kind="pair" /></td>,
  entry_price: () => (t) => <td className="num">{fmtPrice(t.entry_price)}</td>,
  exit_price: () => (t) => <td className="num">{fmtPrice(t.exit_price)}</td>,
  volume: () => (t) => <td className="num">{t.volume == null ? <span className="muted">—</span> : fmtNum(t.volume, 2)}</td>,
  sl: () => (t) => <td className="num">{fmtNum(t.sl_size_pips, 1)}</td>,
  mfe: () => (t) => <td className="num">{fmtNum(t.mfe_pips, 1)}</td>,
  maxr: () => (t) => <td className="num max-r">{fmtNum(t.max_r)}</td>,
  setup: () => (t) => <td><Pill value={t.setup} kind="setup" /></td>,
  probability: () => (t) => <td><Pill value={t.probability} kind="prob" /></td>,
  // Objective rule adherence, from the trade's strategy rules (see
  // src/adherence.js). Server-enriched as t.adherence, so this renders the same
  // verdict the trade-preview badge shows rather than re-deciding it here. Off by
  // default: it only means anything once a strategy defines rules.
  adherence: () => (t) => {
    const status = t.adherence?.status;
    if (status === 'followed') {
      return <td><span className="pill adh-followed" title="Followed every evaluable rule">✓ Followed</span></td>;
    }
    if (status === 'broken') {
      const broke = (t.adherence.brokenRules || []).map((r) => RULE_LABEL[r] || r);
      return (
        <td>
          <span className="pill adh-broken" title={`Broke: ${broke.join(', ')}`}>
            ⚠ {broke.length === 1 ? broke[0] : `${broke.length} rules`}
          </span>
        </td>
      );
    }
    // 'unassessed' (rules exist but this trade lacks the fields) and 'norules'
    // both read as a neutral dash — never as a failure.
    return <td><span className="muted">—</span></td>;
  },
  // Win / Loss / BE in words. Same precision-aware classification as the P&L
  // cell's colour, so the two can never contradict each other.
  status: ({ unit, beRounding }) => (t) => {
    const out = tradeOutcome(t, unit, beRounding);
    return <td>{out ? <span className={`pill out-${out}`}>{OUTCOME_LABEL[out]}</span> : <span className="pill pill-empty">—</span>}</td>;
  },
  // Net P&L: real $ profit (pnl_money) per prop account, else Fixed R.
  result: ({ unit, beRounding }) => (t) => {
    const result = unit === 'USD' ? t.pnl_money : t.fixed_r;
    // Colour by the precision-aware outcome (a breakeven trade reads blue, not
    // red) — but keep the real value in the text, never zeroed.
    const out = tradeOutcome(t, unit, beRounding);
    const cls = out === 'win' ? 'cell-win' : out === 'loss' ? 'cell-loss' : out === 'be' ? 'cell-be' : '';
    const text = result == null ? '' : unit === 'USD' ? fmtMoney(result, { sign: true }) : fmtNum(result);
    return <td className={`num ${cls}`}>{text}</td>;
  },
  commission: () => (t) => <td className="num">{t.commission == null ? <span className="muted">—</span> : fmtMoney(t.commission, { sign: true })}</td>,
  comments: () => (t) => <td className="cell-notes"><NoteMark text={t.comments} /></td>,
};

// Header renderers for columns whose heading isn't text. Only the selection
// column: its header is the select-all box.
const HEADERS = {
  select: ({ allSelected, someSelected, onSelectAll }) => (
    <RowCheck
      checked={allSelected}
      indeterminate={someSelected && !allSelected}
      onChange={onSelectAll}
      label="Select all trades"
    />
  ),
};

// The spec plus its renderers. A column with no renderer would render as an empty
// cell forever, so that's a hard error rather than a silent hole.
export function buildColumns(ctx = {}) {
  return TRADE_COLUMNS.map((col) => {
    const make = CELLS[col.id];
    if (!make) throw new Error(`trade column "${col.id}" has no cell renderer`);
    return { ...col, cell: make(ctx), header: HEADERS[col.id] ? HEADERS[col.id](ctx) : col.label };
  });
}

export default function TradesTable({
  trades, onRowClick, highlightId, unit = 'R', columnOverrides = {}, beRounding = false,
  selected = null, onSelect = () => {}, onSelectAll = () => {},
}) {
  // Selection is owned by the page (TradeLog) so the toolbar can report on it.
  const sel = selected || new Set();
  const isSelected = (id) => sel.has(id);
  const selectableCount = trades.length;
  const selectedHere = trades.reduce((n, t) => n + (sel.has(t.id) ? 1 : 0), 0);
  const ctx = {
    unit,
    beRounding,
    isSelected,
    onSelect,
    onSelectAll,
    // "All" means all the rows CURRENTLY IN VIEW, not every trade on the account —
    // the header box has to agree with what's under it after a filter narrows it.
    allSelected: selectableCount > 0 && selectedHere === selectableCount,
    someSelected: selectedHere > 0,
  };
  const cols = buildColumns(ctx).filter((c) => colVisible(columnOverrides, c));
  return (
    <div className="grid-wrap">
      {/* Column count drives the table's minimum width (see .grid), so showing
          more columns widens the table instead of squeezing every one of them. */}
      <table className="grid" style={{ '--grid-cols': cols.length }}>
        <thead>
          <tr>{cols.map((c) => <th key={c.id} className={c.narrow ? 'col-select' : undefined}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {trades.length === 0 && (
            <tr><td className="empty" colSpan={cols.length}>No trades yet — close a trade in MT5 and it appears here instantly.</td></tr>
          )}
          {trades.map((t) => {
            const rowClass = [
              !t.tagged ? 'row-untagged' : '',
              t.id === highlightId ? 'row-flash' : '',
              isSelected(t.id) ? 'row-selected' : '',
            ].join(' ').trim();
            return (
              <tr key={t.id} className={rowClass} onClick={() => onRowClick(t)} title={t.tagged ? 'Edit tags' : 'Click to tag this trade'}>
                {cols.map((c) => <React.Fragment key={c.id}>{c.cell(t)}</React.Fragment>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
