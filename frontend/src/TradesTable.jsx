import React from 'react';
import { fmtDate, fmtTime, fmtNum, slug } from './constants.js';
import { fmtMoney } from './metrics.js';

// The result column is R (Fixed R) in the god/strategy view, but real $ profit
// (pnl_money) when a single prop account is selected.
const cols = (unit) => [
  'DATE / TIME', 'SESSION', 'PAIR', 'SETUP', 'PROBABILITY', 'MTF PHASE',
  'SL Size', 'MFE', 'MAX R', unit === 'USD' ? 'PROFIT' : 'FIXED R TARGET', 'M15', 'H1', 'H4', 'COMMENTS',
];

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

export default function TradesTable({ trades, onRowClick, highlightId, unit = 'R' }) {
  const COLS = cols(unit);
  const usd = unit === 'USD';
  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>{COLS.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {trades.length === 0 && (
            <tr><td className="empty" colSpan={COLS.length}>No trades yet — close a trade in MT5 and it appears here instantly.</td></tr>
          )}
          {trades.map((t) => {
            // Result cell: $ profit (pnl_money) per account, else Fixed R.
            const result = usd ? t.pnl_money : t.fixed_r;
            const resultClass = result == null ? '' : result > 0 ? 'cell-win' : result < 0 ? 'cell-loss' : 'cell-be';
            const resultText = result == null ? '' : usd ? fmtMoney(result, { sign: true }) : fmtNum(result);
            const rowClass = [
              !t.tagged ? 'row-untagged' : '',
              t.id === highlightId ? 'row-flash' : '',
            ].join(' ').trim();
            return (
              <tr key={t.id} className={rowClass} onClick={() => onRowClick(t)} title={t.tagged ? 'Edit tags' : 'Click to tag this trade'}>
                <td className="cell-dt">{fmtDate(t.close_time)}<span className="cell-time">{fmtTime(t.close_time)}</span></td>
                <td><Pill value={t.session} kind="session" /></td>
                <td><Pill value={t.symbol_base || t.symbol} kind="pair" /></td>
                <td><Pill value={t.setup} kind="setup" /></td>
                <td><Pill value={t.probability} kind="prob" /></td>
                <td><Pill value={t.mtf_phase} kind="mtf" /></td>
                <td className="num">{fmtNum(t.sl_size_pips, 1)}</td>
                <td className="num">{fmtNum(t.mfe_pips, 1)}</td>
                <td className="num max-r">{fmtNum(t.max_r)}</td>
                <td className={`num ${resultClass}`}>{resultText}</td>
                <td><ChartLink url={t.m15_url} label="M15" /></td>
                <td><ChartLink url={t.h1_url} label="H1" /></td>
                <td><ChartLink url={t.h4_url} label="H4" /></td>
                <td className="comments">{t.comments || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
