import React, { useMemo } from 'react';
import {
  EmptyState, PanelTableCell, PanelTableHead, PanelTableRow,
} from '@/components/primitives';
import { fmtVal, valueField, tradeOutcome } from '../../lib/metrics.js';

// The compact "most recent closed trades" table.
//
// LIFTED OUT OF Dashboard.jsx VERBATIM, for the same reason AccountDetails.jsx
// was: Accounts › Details shows the same list for the selected account, and two
// copies of a three-column trade table drift the first time either is tuned.
//
// REBUILT ON Panel* PRIMITIVES 2026-08-28. The `.jo-rt-*` classes and the <table> are
// gone; the columns, the order and the outcome colouring are not.
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

// Rhea's own tracks: the date takes a little more than the other two, the symbol
// centres, the value sits right. Declared once — see the note in the render.
const COLS = 'minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)';

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
  /* DIVS, NOT A <table>. Three columns of one value each is a list, not tabular data —
   * there is nothing to compare across rows that a <table> would help a screen reader
   * with, and the semantics cost real layout control: a table cannot flex, so the
   * symbol column could not both truncate and let the P&L stay right-aligned at the
   * card's narrowest width.
   *
   * THE COLUMN TEMPLATE IS DECLARED ONCE and handed to both the header and every row.
   * A header and its rows that compute their tracks separately are a header that drifts
   * one pixel off its own data the first time either is touched — which is exactly what
   * happened to the version this replaces, where the header used PanelRowHead's fixed
   * widths and the rows used PanelRow's. */
  return (
    <div>
      <PanelTableHead cols={COLS}>
        {/* `head` + `align` as PROPS, never classes: a Tailwind utility written in this
            file compiles to nothing, so `className="text-right"` here would leave the
            Net P&L header left-aligned above a right-aligned column, silently. */}
        <PanelTableCell head>Close date</PanelTableCell>
        <PanelTableCell head align="center">Symbol</PanelTableCell>
        <PanelTableCell head align="right">Net P&amp;L</PanelTableCell>
      </PanelTableHead>
      {recent.map((t) => {
        const out = tradeOutcome(t, unit, beRounding);
        const val = Number(t[field]);
        return (
          <PanelTableRow key={t.id} cols={COLS}>
            <PanelTableCell>{fmtDate(t.close_time)}</PanelTableCell>
            <PanelTableCell align="center" strong>{t.symbol_base || t.symbol}</PanelTableCell>
            <PanelTableCell align="right" strong tone={out === 'win' ? 'pos' : out === 'loss' ? 'neg' : undefined}>
              {fmtVal(val, unit)}
            </PanelTableCell>
          </PanelTableRow>
        );
      })}
    </div>
  );
}
