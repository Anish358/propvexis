import React from 'react';
import { fmtDate, fmtTime, fmtNum, fmtDuration, slug } from './constants.js';
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

function ChartLink({ url, label }) {
  if (!url) return <span className="muted">—</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="chart-link" onClick={(e) => e.stopPropagation()}>
      {label}
    </a>
  );
}

const OUTCOME_LABEL = { win: 'Win', loss: 'Loss', be: 'BE' };

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
// over the display unit + precision setting, since a few cells read differently in
// R than in $. WHICH columns exist, what they're called and which are on by default
// is the spec next door — this file only knows how to draw one.
const CELLS = {
  datetime: () => (t) => <td className="cell-dt">{fmtDate(t.close_time)}<span className="cell-time">{fmtTime(t.close_time)}</span></td>,
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
  volume: () => (t) => <td className="num cell-center">{t.volume == null ? <span className="muted">—</span> : fmtNum(t.volume, 2)}</td>,
  sl: () => (t) => <td className="num">{fmtNum(t.sl_size_pips, 1)}</td>,
  mfe: () => (t) => <td className="num">{fmtNum(t.mfe_pips, 1)}</td>,
  maxr: () => (t) => <td className="num max-r">{fmtNum(t.max_r)}</td>,
  setup: () => (t) => <td><Pill value={t.setup} kind="setup" /></td>,
  probability: () => (t) => <td><Pill value={t.probability} kind="prob" /></td>,
  mtf: () => (t) => <td><Pill value={t.mtf_phase} kind="mtf" /></td>,
  // Win / Loss / BE in words. Same precision-aware classification as the P&L
  // cell's colour, so the two can never contradict each other.
  status: (unit, beRounding) => (t) => {
    const out = tradeOutcome(t, unit, beRounding);
    return <td>{out ? <span className={`pill out-${out}`}>{OUTCOME_LABEL[out]}</span> : <span className="pill pill-empty">—</span>}</td>;
  },
  // Net P&L: real $ profit (pnl_money) per prop account, else Fixed R.
  result: (unit, beRounding) => (t) => {
    const result = unit === 'USD' ? t.pnl_money : t.fixed_r;
    // Colour by the precision-aware outcome (a breakeven trade reads blue, not
    // red) — but keep the real value in the text, never zeroed.
    const out = tradeOutcome(t, unit, beRounding);
    const cls = out === 'win' ? 'cell-win' : out === 'loss' ? 'cell-loss' : out === 'be' ? 'cell-be' : '';
    const text = result == null ? '' : unit === 'USD' ? fmtMoney(result, { sign: true }) : fmtNum(result);
    return <td className={`num ${cls}`}>{text}</td>;
  },
  commission: () => (t) => <td className="num">{t.commission == null ? <span className="muted">—</span> : fmtMoney(t.commission, { sign: true })}</td>,
  m15: () => (t) => <td><ChartLink url={t.m15_url} label="M15" /></td>,
  h1: () => (t) => <td><ChartLink url={t.h1_url} label="H1" /></td>,
  h4: () => (t) => <td><ChartLink url={t.h4_url} label="H4" /></td>,
  comments: () => (t) => <td className="cell-notes"><NoteMark text={t.comments} /></td>,
};

// The spec plus its renderers. A column with no renderer would render as an empty
// cell forever, so that's a hard error rather than a silent hole.
export function buildColumns(unit = 'R', beRounding = false) {
  return TRADE_COLUMNS.map((col) => {
    const make = CELLS[col.id];
    if (!make) throw new Error(`trade column "${col.id}" has no cell renderer`);
    return { ...col, cell: make(unit, beRounding) };
  });
}

export default function TradesTable({ trades, onRowClick, highlightId, unit = 'R', columnOverrides = {}, beRounding = false }) {
  const cols = buildColumns(unit, beRounding).filter((c) => colVisible(columnOverrides, c));
  return (
    <div className="grid-wrap">
      {/* Column count drives the table's minimum width (see .grid), so showing
          more columns widens the table instead of squeezing every one of them. */}
      <table className="grid" style={{ '--grid-cols': cols.length }}>
        <thead>
          <tr>{cols.map((c) => <th key={c.id}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {trades.length === 0 && (
            <tr><td className="empty" colSpan={cols.length}>No trades yet — close a trade in MT5 and it appears here instantly.</td></tr>
          )}
          {trades.map((t) => {
            const rowClass = [
              !t.tagged ? 'row-untagged' : '',
              t.id === highlightId ? 'row-flash' : '',
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
