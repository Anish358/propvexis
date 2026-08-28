import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CalCell, CalCellBody, CalDayNum, CalDow, CalGrid, CalNavButton, CalRoot, CalWeek,
  PanelHead, PanelMeta,
} from '@/components/primitives';
import { dayKey, fmtValShort } from '../../lib/metrics.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const round2 = (n) => Math.round(n * 100) / 100;
/* A day's tone. 'flat' is a real value and not a fallback: a day that was TRADED and
 * closed at zero is a result, and drawing it like an untraded day would turn a week of
 * scratches into a week off. `cellTone` is what distinguishes the two — it is handed
 * the day's data, not just its number. */
const tone = (n) => (n > 0 ? 'win' : n < 0 ? 'loss' : 'flat');
const cellTone = (data) => (data ? tone(data.pnl) : 'idle');

// Marker glyphs for the optional business-event layer. Deliberately shapes, not
// just colours: a payout, a milestone and a breach must be distinguishable
// without relying on hue (the same rule roomStatus follows in PropOS).
const MARKER_GLYPH = { payout: '$', milestone: '✓', breach: '✕' };

// Monthly P&L calendar with a "Week N" summary card aligned to each row. `days`
// is a Map keyed by YYYY-MM-DD -> { pnl, trades, wins, losses }. The day grid and
// week column are ONE 8-column CSS grid (not two side-by-side panels), so each
// week card lines up exactly with its row of days.
//
// `markers` is OPTIONAL: a Map keyed the same way -> [{ kind, label }], used by
// the Prop OS Overview to lay payouts, phase passes and breaches over the same
// grid. It is additive on purpose — the Overview reuses this component verbatim
// rather than forking a second calendar, and the Dashboard passes no markers and
// renders exactly as before.
export default function MonthCalendar({ year, month, dayMap, markers, onPrev, onNext, onToday, onSelectDay, unit = 'R' }) {
  const { rows, monthTotal, tradingDays } = useMemo(() => {
    const first = new Date(year, month, 1);
    const startPad = first.getDay(); // leading blanks (Sun-start grid)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    let monthTotal = 0, tradingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = dayKey(new Date(year, month, d));
      const data = dayMap.get(k);
      if (data) { monthTotal += data.pnl; tradingDays += 1; }
      cells.push({ day: d, key: k, data });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      let pnl = 0, days = 0;
      for (const c of week) if (c?.data) { pnl += c.data.pnl; days += 1; }
      rows.push({ week, pnl: round2(pnl), days });
    }
    /* NO PADDING TO SIX ROWS ANY MORE (2026-08-28).
     *
     * It used to pad every month out to six week-rows, because the card had a FIXED
     * height (`card-lg`) and six equal rows were how the grid divided it — a 4- or
     * 5-row month would otherwise have grown taller cells. The rebuilt cells size
     * themselves (`min-h` on CalCell), so the card can size to its content instead, and
     * the padding became what it looks like: one or two rows of empty boxes and a
     * "Week 6 · 0 days · 0R" summary for a week that does not exist in this month.
     *
     * A month renders the weeks it has. August 2026 has five. */
    return { rows, monthTotal: round2(monthTotal), tradingDays };
  }, [year, month, dayMap]);

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  return (
    <CalRoot>
      <PanelHead
        sub="Daily performance"
        meta={(
          <>
            <PanelMeta label="Month total" tone={monthTotal > 0 ? 'pos' : monthTotal < 0 ? 'neg' : undefined}>
              {fmtValShort(monthTotal, unit)}
            </PanelMeta>
            <PanelMeta label="Traded">{tradingDays} day{tradingDays === 1 ? '' : 's'}</PanelMeta>
          </>
        )}
        action={(
          /* The month stepper sits with the title rather than off to one side: it
             CHANGES the title, and a control that rewrites a heading belongs next to
             the heading it rewrites. "This month" only appears when you have left it. */
          <span className="cal-nav">
            <CalNavButton onClick={onPrev} aria-label="Previous month"><ChevronLeft aria-hidden="true" /></CalNavButton>
            <CalNavButton onClick={onNext} aria-label="Next month"><ChevronRight aria-hidden="true" /></CalNavButton>
          </span>
        )}
      >
        {MONTHS[month]} {year}
        {onToday && !isCurrentMonth && (
          <button type="button" className="cal-today-btn" onClick={onToday}>This month</button>
        )}
      </PanelHead>

      <CalGrid>
        {WD.map((d) => <CalDow key={d}>{d}</CalDow>)}
        <CalDow />

        {rows.map((r, ri) => (
          <React.Fragment key={ri}>
            {r.blank ? (
              Array.from({ length: 8 }, (_, i) => <div key={`blank-${ri}-${i}`} />)
            ) : (
              <>
                {r.week.map((c, i) => {
                  if (!c) return <div key={`pad-${ri}-${i}`} />;
                  const t = cellTone(c.data);
                  const winPct = c.data && (c.data.wins + c.data.losses) > 0 ? Math.round((100 * c.data.wins) / (c.data.wins + c.data.losses)) : null;
                  const marks = markers?.get(c.key);
                  const clickable = !!(onSelectDay && c.data);
                  return (
                    <CalCell
                      key={c.key}
                      tone={t}
                      clickable={clickable}
                      onClick={clickable ? () => onSelectDay(c) : undefined}
                    >
                      <CalDayNum idle={t === 'idle'}>
                        {c.day}
                        {marks?.length > 0 && (
                          // Title carries the full text: a day can hold several
                          // events and the cell has room for glyphs only.
                          <span className="cal-marks" title={marks.map((m) => m.label).join('\n')}>
                            {marks.map((m, mi) => (
                              <span key={mi} className={`cal-mark cal-mark--${m.kind}`} aria-label={m.label}>
                                {MARKER_GLYPH[m.kind] || '•'}
                              </span>
                            ))}
                          </span>
                        )}
                      </CalDayNum>
                      {c.data && (
                        <CalCellBody
                          tone={t}
                          value={fmtValShort(c.data.pnl, unit)}
                          sub={`${c.data.trades} trade${c.data.trades === 1 ? '' : 's'}${winPct != null ? ` · ${winPct}%` : ''}`}
                        />
                      )}
                    </CalCell>
                  );
                })}
                <CalWeek
                  label={`Week ${ri + 1}`}
                  tone={tone(r.pnl)}
                  value={fmtValShort(r.pnl, unit)}
                  sub={`${r.days} day${r.days === 1 ? '' : 's'}`}
                />
              </>
            )}
          </React.Fragment>
        ))}
      </CalGrid>
    </CalRoot>
  );
}
