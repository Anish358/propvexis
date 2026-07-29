import React from 'react';
import { fmtDate, fmtTime, fmtNum, fmtDuration, slug, RULE_LABEL } from './constants.js';
import { fmtMoney, tradeOutcome } from './metrics.js';

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

// Column registry for the trade log. Each column has a stable `id` (used to
// persist the user's show/hide choice), a header `label`, whether it shows by
// default, and a `cell(t)` renderer returning the full <td>. The result column's
// label + value depend on the display unit (R vs $), so columns are built per unit.
export function buildColumns(unit = 'R', beRounding = false) {
  const usd = unit === 'USD';
  return [
    {
      id: 'datetime', label: 'DATE / TIME', defaultOn: true,
      cell: (t) => <td className="cell-dt">{fmtDate(t.close_time)}<span className="cell-time">{fmtTime(t.close_time)}</span></td>,
    },
    {
      id: 'duration', label: 'DURATION', defaultOn: true,
      cell: (t) => <td className="cell-dur">{fmtDuration(t.open_time, t.close_time) || <span className="muted">—</span>}</td>,
    },
    {
      id: 'type', label: 'TYPE', defaultOn: true,
      cell: (t) => (
        <td>{t.direction
          ? <span className={`pill dir-${slug(t.direction)}`}>{t.direction === 'sell' ? 'Sell' : 'Buy'}</span>
          : <span className="pill pill-empty">—</span>}
        </td>
      ),
    },
    { id: 'session', label: 'SESSION', defaultOn: true, cell: (t) => <td><Pill value={t.session} kind="session" /></td> },
    { id: 'pair', label: 'PAIR', defaultOn: true, cell: (t) => <td><Pill value={t.symbol_base || t.symbol} kind="pair" /></td> },
    { id: 'entry_price', label: 'ENTRY PRICE', defaultOn: false, cell: (t) => <td className="num">{fmtPrice(t.entry_price)}</td> },
    { id: 'exit_price', label: 'EXIT PRICE', defaultOn: false, cell: (t) => <td className="num">{fmtPrice(t.exit_price)}</td> },
    { id: 'volume', label: 'VOLUME / LOT', defaultOn: false, cell: (t) => <td className="num">{t.volume == null ? <span className="muted">—</span> : fmtNum(t.volume, 2)}</td> },
    { id: 'setup', label: 'SETUP', defaultOn: true, cell: (t) => <td><Pill value={t.setup} kind="setup" /></td> },
    { id: 'probability', label: 'PROBABILITY', defaultOn: true, cell: (t) => <td><Pill value={t.probability} kind="prob" /></td> },
    { id: 'mtf', label: 'MTF PHASE', defaultOn: true, cell: (t) => <td><Pill value={t.mtf_phase} kind="mtf" /></td> },
    { id: 'sl', label: 'SL Size', defaultOn: true, cell: (t) => <td className="num">{fmtNum(t.sl_size_pips, 1)}</td> },
    { id: 'mfe', label: 'MFE', defaultOn: true, cell: (t) => <td className="num">{fmtNum(t.mfe_pips, 1)}</td> },
    { id: 'maxr', label: 'MAX R', defaultOn: true, cell: (t) => <td className="num max-r">{fmtNum(t.max_r)}</td> },
    {
      // Result: real $ profit (pnl_money) per prop account, else Fixed R.
      id: 'result', label: usd ? 'PROFIT' : 'FIXED R TARGET', defaultOn: true,
      cell: (t) => {
        const result = usd ? t.pnl_money : t.fixed_r;
        // Color by the precision-aware outcome (a breakeven trade reads grey, not
        // red) — but keep the real $ value in the text, never zeroed.
        const out = tradeOutcome(t, unit, beRounding);
        const cls = out === 'win' ? 'cell-win' : out === 'loss' ? 'cell-loss' : out === 'be' ? 'cell-be' : '';
        const text = result == null ? '' : usd ? fmtMoney(result, { sign: true }) : fmtNum(result);
        return <td className={`num ${cls}`}>{text}</td>;
      },
    },
    {
      // Objective rule adherence for this trade, from its strategy's rules (see
      // src/adherence.js). Server-enriched as t.adherence, so this renders the
      // same verdict the trade-preview badge shows — no duplicate logic here.
      // OFF by default: it is only meaningful once a strategy defines rules, and
      // an opt-in column keeps existing layouts unchanged.
      id: 'adherence', label: 'RULES', defaultOn: false,
      cell: (t) => {
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
        // 'unassessed' (rules exist but this trade lacks the fields) and
        // 'norules' both read as a neutral dash — never as a failure.
        return <td><span className="muted">—</span></td>;
      },
    },
    {
      id: 'commission', label: 'COMMISSION', defaultOn: true,
      cell: (t) => <td className="num">{t.commission == null ? <span className="muted">—</span> : fmtMoney(t.commission, { sign: true })}</td>,
    },
    { id: 'm15', label: 'M15', defaultOn: true, cell: (t) => <td><ChartLink url={t.m15_url} label="M15" /></td> },
    { id: 'h1', label: 'H1', defaultOn: true, cell: (t) => <td><ChartLink url={t.h1_url} label="H1" /></td> },
    { id: 'h4', label: 'H4', defaultOn: true, cell: (t) => <td><ChartLink url={t.h4_url} label="H4" /></td> },
    { id: 'comments', label: 'COMMENTS', defaultOn: true, cell: (t) => <td className="comments">{t.comments || ''}</td> },
  ];
}

// Effective visibility: an explicit user override wins, else the column default.
export const colVisible = (overrides, col) => overrides?.[col.id] ?? col.defaultOn;

export default function TradesTable({ trades, onRowClick, highlightId, unit = 'R', columnOverrides = {}, beRounding = false }) {
  const cols = buildColumns(unit, beRounding).filter((c) => colVisible(columnOverrides, c));
  return (
    <div className="grid-wrap">
      <table className="grid">
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
