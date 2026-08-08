import React, { useEffect, useMemo, useState } from 'react';
import { fetchCalendar } from '../../lib/api.js';
import { filterBriefEvents, formatBriefDate, formatBriefTime, defaultBriefPrefs } from '../dashboard/briefPrefs.js';
import { sevClass } from '../alerts/Notifications.jsx';

// Prop Brief — the Overview's attention banner.
//
// Structurally the Dashboard's Today's Brief (same `.dash-banner` box, same
// heading treatment), split into two halves that answer two different questions:
//
//   LEFT  — what needs a decision today: accounts near a violation, targets hit,
//           evaluation milestones, trading days outstanding, and today's
//           high-impact news IF it lands on a currency you care about.
//   RIGHT — what's scheduled or drifting: payouts due, inactive accounts, passed
//           evaluations still waiting on a funded login.
//
// Every item except the news comes server-computed from GET /api/prop/overview
// (`brief.left` / `brief.right`, see propBrief() in src/propOverview.js), so the
// rules that decide "near a violation" live in one tested place rather than in
// JSX.
//
// NO LIVE CLOCK, deliberately. The Dashboard's banner ticks every minute because
// its "Next 4 Hours" window has to age events out on its own. This banner is
// about business state — payouts due, accounts idle — which moves on the scale of
// days, so a ticking second hand would be motion that never means anything.

// News is narrowed to HIGH impact and TODAY regardless of the user's Today's
// Brief settings: the spec is "today's high-impact news (only if relevant)", and
// a business brief shouldn't inherit a "This Week / All Events" choice made for
// the trading dashboard. Their CURRENCY and TIMEZONE picks are honoured, because
// those say which markets they trade and where they live.
const newsPrefsFrom = (prefs) => ({
  ...defaultBriefPrefs(),
  ...(prefs || {}),
  importance: 'high',
  window: 'today',
});

const MAX_NEWS = 2;

function BriefItem({ item }) {
  return (
    <li className={`prop-brief-item ${sevClass(item.severity)}`}>
      <span className="prop-brief-item-title">{item.title}</span>
      {item.detail && <span className="prop-brief-item-detail">{item.detail}</span>}
    </li>
  );
}

function BriefColumn({ label, items, empty }) {
  return (
    <div className="prop-brief-col">
      <div className="dash-banner-label">{label}</div>
      {items.length === 0 ? (
        <div className="dash-banner-empty muted">{empty}</div>
      ) : (
        <ul className="prop-brief-list">
          {items.map((i) => <BriefItem key={i.id} item={i} />)}
        </ul>
      )}
    </div>
  );
}

export default function PropBrief({ brief, briefPrefs, loading = false }) {
  // One `now` per mount rather than a ticking clock — see the note above.
  const now = useMemo(() => new Date(), []);
  const prefs = useMemo(() => newsPrefsFrom(briefPrefs), [briefPrefs]);

  // The economic feed is global (/api/calendar) and must never block the banner:
  // null while loading, [] on any error, and the news block simply doesn't render.
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let live = true;
    fetchCalendar()
      .then((d) => { if (live) setEvents(d.events || []); })
      .catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, []);

  const news = useMemo(
    () => filterBriefEvents(events || [], prefs, now).slice(0, MAX_NEWS),
    [events, prefs, now],
  );

  // "Only if relevant" is load-bearing: with nothing high-impact today the news
  // rows are absent entirely rather than showing an empty-state that would take
  // up as much room as the content would have.
  const left = [
    ...(brief?.left ?? []),
    ...news.map((e, i) => ({
      id: `news-${e.date}-${i}`,
      severity: 'warning',
      title: `${e.country} · ${e.title}`,
      detail: formatBriefTime(e.date, prefs.timezone, now),
    })),
  ];
  const right = brief?.right ?? [];

  return (
    <div className="dash-banner prop-brief">
      <div className="dash-banner-head">
        <h3>Prop Brief</h3>
        <span className="dash-banner-date">{formatBriefDate(now, prefs.timezone)}</span>
      </div>

      <div className="prop-brief-cols">
        <BriefColumn
          label="Needs your attention"
          items={left}
          empty={loading ? 'Loading…' : 'Nothing needs a decision right now.'}
        />
        <BriefColumn
          label="Scheduled & idle"
          items={right}
          empty={loading ? 'Loading…' : 'Nothing scheduled or drifting.'}
        />
      </div>
    </div>
  );
}
