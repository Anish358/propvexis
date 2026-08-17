import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from '../../app/PageHeader.jsx';
import DayCard from './DayCard.jsx';
import DayJournalWorkspace from './DayJournalWorkspace.jsx';
import TradePreview from '../trades/TradePreview.jsx';
import { EmptyState } from '@/components/primitives';
import { fetchDayNotes, saveDayNote } from '../../lib/api.js';
import { fmtVal } from '../../lib/metrics.js';
import { groupByDay, summarizeAll } from './dayStats.js';

// The Daily Journal — a workspace for reviewing trading days, not another table.
//
// The page is a FEED of days, newest first, one card each: the day's result, its
// shape as a curve, the eight figures that describe the session, and its trades
// behind a disclosure. That's the shift from the old version, which showed one day
// at a time behind prev/next arrows — you had to already know which day you wanted,
// and comparing two days meant clicking between them. A feed makes "how has the
// week gone" answerable by scrolling, and keeps the review action (Journal) next to
// the day it belongs to.
//
// Everything respects the global filters, like every other page: `trades` from
// context is already the filtered set, so narrowing to one symbol re-describes
// every day in terms of that symbol.

// How many days to render at once. A year of trading is ~250 cards, each with a
// chart and eight tiles — enough DOM to make the page janky for a view where
// nobody scrolls past the last week or two. "Show earlier days" extends it.
const PAGE = 14;

const sign = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

export default function DayView() {
  const {
    trades = [], unit = 'R', connected, toggleSidebar, tradeSettings = {},
    saveTrade, removeTrade, strategies = [], accounts = [],
  } = useOutletContext();
  const beRounding = !!tradeSettings.beRounding;

  const days = useMemo(() => groupByDay(trades, unit, beRounding), [trades, unit, beRounding]);
  const overall = useMemo(() => summarizeAll(days), [days]);

  // Which day cards have their trades showing. A Set of day keys, so expanding one
  // doesn't collapse another — reviewing two days side by side is the point.
  const [openDays, setOpenDays] = useState(() => new Set());
  const [shown, setShown] = useState(PAGE);
  const [journalDay, setJournalDay] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  // Day notes, keyed 'YYYY-MM-DD'. Loaded here rather than in App's context because
  // this is the only page that reads them, and one map covers the whole feed — the
  // server returns every day the user has written in a single trip.
  //
  // A failure is swallowed on purpose: a note that won't load must not take the
  // day feed down with it. The workspace then opens with an empty Day Review, and
  // saving one still works.
  const [dayNotes, setDayNotes] = useState({});
  useEffect(() => {
    let live = true;
    fetchDayNotes()
      .then((notes) => { if (live) setDayNotes(notes); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Write through to the local map so the workspace and any later open of the same
  // day agree with what was just saved, without a refetch.
  async function persistDayNote(key, note) {
    const saved = await saveDayNote(key, note);
    setDayNotes((prev) => ({ ...prev, [key]: saved }));
    return saved;
  }

  const toggleDay = (key) => setOpenDays((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const visible = days.slice(0, shown);
  const allOpen = visible.length > 0 && visible.every((d) => openDays.has(d.key));
  const toggleAll = () => setOpenDays(allOpen ? new Set() : new Set(visible.map((d) => d.key)));

  // Read live from `trades` rather than snapshotted, so an edit made in the preview
  // reflects immediately and a deleted trade closes the panel instead of showing a
  // stale row.
  const previewTrade = useMemo(() => trades.find((t) => t.id === previewId) || null, [trades, previewId]);
  // Same for the open journal: re-resolve it from the regrouped days so saved notes
  // show up without reopening.
  const liveJournalDay = useMemo(
    () => (journalDay ? days.find((d) => d.key === journalDay.key) || null : null),
    [days, journalDay],
  );

  // Where the open day sits in the feed, so the workspace can step to the day either
  // side of it. `days` is newest-first, so the OLDER day — "previous" — is the next
  // index up. The page stays the way you pick a day; this is for carrying a review
  // into the day beside it (see DayJournalWorkspace's header).
  const journalIdx = liveJournalDay ? days.findIndex((d) => d.key === liveJournalDay.key) : -1;

  function goToDay(next) {
    if (!next) return;
    setJournalDay(next);
    // Extend the feed if the day stepped to sits past the paging window, so closing
    // the workspace lands on that day's card instead of above where it would be.
    const i = days.findIndex((d) => d.key === next.key);
    setShown((n) => Math.max(n, i + 1));
  }

  const head = <PageHeader title="Daily Journal" connected={connected} onMenu={toggleSidebar} />;

  if (!days.length) {
    return (
      <div className="page">
        {head}
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>}
          title="No trading days yet"
          description="Once trades sync in, every session shows up here as a day you can review, journal and learn from."
        />
      </div>
    );
  }

  return (
    <div className="page">
      {head}
      <div className="page-body dv-page">
        {/* Summary strip: the whole filtered period in one line, then the days. */}
        <div className="dv-bar">
          <span className="dv-bar-label">Summary</span>
          <div className="dv-bar-stats">
            <span className="dv-bar-stat"><b className={sign(overall.net)}>{fmtVal(overall.net, unit)}</b> net</span>
            <span className="dv-bar-sep" />
            <span className="dv-bar-stat"><b>{overall.days}</b> day{overall.days === 1 ? '' : 's'}</span>
            <span className="dv-bar-sep" />
            <span className="dv-bar-stat"><b>{overall.trades}</b> trade{overall.trades === 1 ? '' : 's'}</span>
            <span className="dv-bar-sep" />
            <span className="dv-bar-stat"><b>{overall.dayWinRate == null ? '—' : `${overall.dayWinRate}%`}</b> green days</span>
            <span className="dv-bar-sep" />
            <span className="dv-bar-stat"><b>{overall.journaled}</b> journaled</span>
          </div>
          {/* One control, matching the layout sketch: open or close every day at
              once, so a week can be read in full or skimmed. */}
          <button
            type="button"
            className={`dv-expand ${allOpen ? 'is-on' : ''}`}
            onClick={toggleAll}
            aria-pressed={allOpen}
            title={allOpen ? 'Collapse all days' : 'Expand all days'}
            aria-label={allOpen ? 'Collapse all days' : 'Expand all days'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {allOpen ? <path d="m18 15-6-6-6 6" /> : <path d="m6 9 6 6 6-6" />}
            </svg>
          </button>
        </div>

        <div className="dv-days">
          {visible.map((day) => (
            <DayCard
              key={day.key}
              day={day}
              unit={unit}
              beRounding={beRounding}
              open={openDays.has(day.key)}
              onToggle={toggleDay}
              onJournal={setJournalDay}
              onTradeClick={(t) => setPreviewId(t.id)}
            />
          ))}
        </div>

        {days.length > shown && (
          <button type="button" className="dv-more" onClick={() => setShown((n) => n + PAGE)}>
            Show earlier days ({days.length - shown} more)
          </button>
        )}
      </div>

      {liveJournalDay && (
        <DayJournalWorkspace
          day={liveJournalDay}
          unit={unit}
          beRounding={beRounding}
          strategies={strategies}
          accounts={accounts}
          dayNote={dayNotes[liveJournalDay.key] || ''}
          prevDay={days[journalIdx + 1] || null}
          nextDay={journalIdx > 0 ? days[journalIdx - 1] : null}
          onPickDay={goToDay}
          onClose={() => setJournalDay(null)}
          onSaveTrade={saveTrade}
          onSaveDayNote={persistDayNote}
        />
      )}

      <TradePreview
        trade={previewTrade}
        unit={unit}
        beRounding={beRounding}
        onClose={() => setPreviewId(null)}
        onDelete={async (id) => { await removeTrade(id); setPreviewId(null); }}
      />
    </div>
  );
}
