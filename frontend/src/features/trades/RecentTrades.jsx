import React, { useMemo } from 'react';
import {
  EmptyState, PanelCell, PanelRow, PanelRowHead, PanelValue,
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
  /* DIVS, NOT A <table>, SINCE THE 2026-08-28 REBUILD. Three columns of one value each
   * is a list, not tabular data — there is nothing to compare across rows that a
   * <table> would help a screen reader with, and the semantics cost real layout
   * control: a table cannot flex, so the symbol column could not both truncate and let
   * the P&L stay right-aligned at the card's narrowest width. The visible structure is
   * unchanged; each row still reads date, symbol, value. */
  return (
    <div>
      <PanelRowHead>
        <PanelCell width="fixed">Date</PanelCell>
        <PanelCell width="grow">Symbol</PanelCell>
        <PanelCell>Net P&amp;L</PanelCell>
      </PanelRowHead>
      {recent.map((t) => {
        const out = tradeOutcome(t, unit, beRounding);
        const val = Number(t[field]);
        return (
          <PanelRow key={t.id}>
            <PanelCell width="fixed" muted>{fmtDate(t.close_time)}</PanelCell>
            <PanelCell width="grow">{t.symbol_base || t.symbol}</PanelCell>
            <PanelValue tone={out === 'win' ? 'pos' : out === 'loss' ? 'neg' : undefined}>
              {fmtVal(val, unit)}
            </PanelValue>
          </PanelRow>
        );
      })}
    </div>
  );
}
