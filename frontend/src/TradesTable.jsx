import React from 'react';
import { fmtDate, fmtTime, fmtNum, fmtDuration, slug } from './constants.js';
import { fmtMoney } from './metrics.js';

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
export function buildColumns(unit = 'R') {
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
        const cls = result == null ? '' : result > 0 ? 'cell-win' : result < 0 ? 'cell-loss' : 'cell-be';
        const text = result == null ? '' : usd ? fmtMoney(result, { sign: true }) : fmtNum(result);
        return <td className={`num ${cls}`}>{text}</td>;
      },
    },
    { id: 'm15', label: 'M15', defaultOn: true, cell: (t) => <td><ChartLink url={t.m15_url} label="M15" /></td> },
    { id: 'h1', label: 'H1', defaultOn: true, cell: (t) => <td><ChartLink url={t.h1_url} label="H1" /></td> },
    { id: 'h4', label: 'H4', defaultOn: true, cell: (t) => <td><ChartLink url={t.h4_url} label="H4" /></td> },
    { id: 'comments', label: 'COMMENTS', defaultOn: true, cell: (t) => <td className="comments">{t.comments || ''}</td> },
  ];
}

// Effective visibility: an explicit user override wins, else the column default.
export const colVisible = (overrides, col) => overrides?.[col.id] ?? col.defaultOn;

export default function TradesTable({ trades, onRowClick, highlightId, unit = 'R', columnOverrides = {} }) {
  const cols = buildColumns(unit).filter((c) => colVisible(columnOverrides, c));
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
