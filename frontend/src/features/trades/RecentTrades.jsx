import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EmptyState, PanelFill, PanelTableCell, PanelTableHead, PanelTableRow,
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
// `limit` IS A CEILING, NOT THE COUNT (2026-08-30). It used to be the count, fixed at
// six — which was fine while the card had no height of its own and simply grew to hold
// them. The card is 374px now (the design's number), and six rows plus a tab strip plus
// a table header plus the footer link do not fit in it: the list pushed "View all
// trades" out of the bottom of the card, where it was clipped and unreachable.
//
// So under `fit`, the count comes from the ROOM, measured. The rows region takes
// whatever height the card has left over (PanelFill), a ResizeObserver reports it, and
// this renders as many whole rows as fit — SIX in the dashboard's card, once the panel
// chrome came down to the prototype's own line-heights (49 + 37 + 6x41 + 41 = 373 in a
// 374px card), and fewer at the 1400px step where the card shrinks to 340. The footer
// link is never what gives way, because it is not inside the region that flexes.
//
// `fit` IS OPT-IN, and that is not timidity. Accounts › Details hands this a `limit` of
// 14 inside a box that is deliberately `overflow-y: auto` — there, the extra rows are
// meant to be reachable by scrolling, and fitting the list to the box would silently
// drop nine trades off a page nobody asked to change. One card wants a list that ends
// where the card does; the other wants a list you can scroll. That is a real difference
// between two callers, so it is a prop.

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

// Rhea's own tracks: the date takes a little more than the other two, the symbol
// centres, the value sits right. Declared once — see the note in the render.
const COLS = 'minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)';

/* One row's height: PanelTableRow is `py-[13px]` around a `leading-[15px]` cell —
 * 13 + 15 + 13 — and 41 is what a browser measures.
 *
 * IT WAS 42 AND THAT WAS WRONG, in a way worth recording: the 42 was measured against
 * hand-written probe markup rather than the real component, whose cell was
 * `leading-5` (20px) and therefore 46px tall. The two errors nearly cancelled — five
 * rows either way — so nothing looked broken. The line-heights are the prototype's now
 * and this is the measured number; recent-trades-fit.test.js derives it from
 * PanelTableRow's own padding and line-height so the two cannot drift apart again. */
const ROW_H = 41;

export default function RecentTrades({ trades = [], unit, beRounding, limit = 6, fit = false }) {
  const field = valueField(unit);
  const fillRef = useRef(null);
  // Starts at `limit` so the first paint is the full list rather than one row that then
  // jumps to five — the measurement lands in the same frame on every browser that has
  // ResizeObserver, and this is what a browser without one keeps.
  const [fits, setFits] = useState(limit);

  useEffect(() => {
    const el = fillRef.current;
    if (!fit || !el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      // The header sits inside the measured region, so subtract what it takes before
      // dividing: `offsetHeight` of the first child, whatever the primitive's padding
      // happens to be, rather than a second copy of that number here.
      const head = el.firstElementChild;
      const headH = head ? head.offsetHeight : 0;
      const room = el.clientHeight - headH;
      setFits(Math.max(1, Math.floor(room / ROW_H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Without `fit` this is exactly the old behaviour: `limit` rows, and the container
  // scrolls if the caller's box is smaller.
  const shown = fit ? Math.min(limit, fits) : limit;
  const recent = useMemo(
    () => trades
      .filter((t) => t[field] != null && t.close_time)
      .sort((a, b) => new Date(b.close_time) - new Date(a.close_time))
      .slice(0, shown),
    [trades, field, shown],
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
  /* PanelFill ONLY under `fit`. Its `flex-1 min-h-0 overflow-hidden` is what stops the
     list pushing the footer link out of a fixed-height card — and it is also exactly
     what would break a caller whose box is meant to scroll, by clipping the rows that
     box exists to reveal. A plain wrapper otherwise. */
  const Wrap = fit ? PanelFill : 'div';
  return (
    <Wrap ref={fit ? fillRef : undefined}>
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
    </Wrap>
  );
}
