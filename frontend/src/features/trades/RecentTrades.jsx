import React, { useMemo } from 'react';
import { EmptyState } from '@/components/primitives';
import { fmtVal, valueField, tradeOutcome } from '../../lib/metrics.js';

// The compact "most recent closed trades" table.
//
// LIFTED OUT OF Dashboard.jsx VERBATIM, for the same reason AccountDetails.jsx
// was: Accounts › Details shows the same list for the selected account, and two
// copies of a three-column trade table drift the first time either is tuned. The
// markup and the `.jo-rt-*` classes are unchanged, so the Dashboard renders
// exactly what it did before the move.
//
// `trades` is whatever set the surrounding page is showing — already scoped to the
// selected account and narrowed by the global filter bar, like every other
// in-memory view in the app. This component does not fetch and does not scope; it
// sorts, caps and formats.
//
// `limit` exists only because the card this sits in is not always the same height:
// the Dashboard's activity card is one grid row, Accounts › Details gives it two.
// It is a row count, not a design difference.

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

export default function RecentTrades({ trades = [], unit, beRounding, limit = 6 }) {
  const field = valueField(unit);
  const recent = useMemo(
    () => trades
      .filter((t) => t[field] != null && t.close_time)
      .sort((a, b) => new Date(b.close_time) - new Date(a.close_time))
      .slice(0, limit),
    [trades, field, limit],
  );
  if (!recent.length) {
    return <EmptyState title="No trades yet" description="Recent trades show up here once you have closed trades." />;
  }
  return (
    <table className="jo-recent-table">
      <thead>
        <tr>
          <th className="jo-rt-date">Date</th>
          <th className="jo-rt-symbol">Symbol</th>
          <th className="jo-rt-val">Net P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {recent.map((t) => {
          const out = tradeOutcome(t, unit, beRounding);
          const val = Number(t[field]);
          return (
            <tr key={t.id}>
              <td className="jo-rt-date">{fmtDate(t.close_time)}</td>
              <td className="jo-rt-symbol">{t.symbol_base || t.symbol}</td>
              <td className={`jo-rt-val num jo-trade-val ${out === 'win' ? 'pos' : out === 'loss' ? 'neg' : ''}`}>{fmtVal(val, unit)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
