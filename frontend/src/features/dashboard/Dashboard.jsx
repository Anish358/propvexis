import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowRight, CalendarDays, ChevronDown, Clock, Flag,
  Loader2, RefreshCw, SlidersHorizontal, Sparkles,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import MonthCalendar from '../calendar/MonthCalendar.jsx';
import DayTradesModal from '../calendar/DayTradesModal.jsx';
import Explain from '../../components/Explain.jsx';
// PHASE 4b — first page on the generated component library. Button and Card come
// from the primitives layer (shadcn on Base UI, coloured through the token bridge);
// their prop APIs are unchanged, so no JSX below moved.
//
// Adopting the shadcn Card model means the `.u-card.dash-*` compound rules in
// legacy CSS stop matching — the class is gone — so the preset now owns each card's
// box (radius, ring, shadow, padding) where hand-tuned values used to. The KPI
// cards' hover treatment had to be rewritten against that box; see the
// `.dash-stat--refined` block in legacy/app.css.
//
// Tabs and EmptyState come from the same place now, but are NOT library-backed:
// they still render `.u-tabs` / `.u-empty` because no generated equivalent exists.
// The import path is the seam, not a claim about the implementation.
//
// Modal is here for SetTargetModal below — the TWELFTH modal, which the Phase 4b audit
// counted as eleven because it is declared inline in a page rather than in its own
// `*Modal.jsx` file. Same hand-rolled backdrop, same six missing behaviours.
import {
  AccountBanner, AccountBannerAction, AccountCardFoot, AccountCardLink, AccountCardShell,
  AccountFootFigure, AccountFootRule, AccountTab, AccountTabMore, AccountTabs, BriefAction, BriefAlert, BriefCard, BriefClock, BriefRange,
  BriefColumns, BriefEvent, BriefHeader, BriefNote, BriefSection, Button, Card, KpiRow,
  ActionStatus, ActionStrip, KpiAside, KpiCard, KpiMain,
  LoadingNote, MeterRow,
  PanelBody, PanelCard, PanelChip, PanelHead, PanelHint, PanelLink, PanelMeta, PanelRow, PanelTab,
  PanelTabs, SkeletonBlock, SkeletonLine,
  SkeletonRegion, Tabs, EmptyState, Modal,
} from '@/components/primitives';
import BriefSettingsPopover from './BriefSettingsPopover.jsx';
import {
  filterBriefEvents, fallbackBriefEvents, sampleBriefEvents, briefEmptyReason,
  briefSectionOn, formatBriefTime,
  briefEventsLabel, defaultBriefPrefs, formatBriefDate, formatBriefClock, BRIEF_WINDOWS,
} from './briefPrefs.js';
import { sevClass } from '../alerts/Notifications.jsx';
import { NetPnlCard, TradeWinCard, ProfitFactorCard, DayWinCard, AvgWinLossCard } from './KpiCards.jsx';
import { healthStatus } from '../prop/PropOS.jsx';
import AccountDetails from '../prop/AccountDetails.jsx';
import RecentTrades from '../trades/RecentTrades.jsx';
import { fetchProp, updateAccount, fetchCalendar } from '../../lib/api.js';
import { chartPalette, token } from '../../lib/theme.js';
import {
  computeMetrics, fmtVal, fmtValShort,
} from '../../lib/metrics.js';

// Chart theming from design tokens (matches Analytics.jsx's equity curve).

// Dashboard V1 — the fixed morning-home layout (daily banner, headline stat
// cards, calendar + recent activity, account health cards). Replaces the old
// widget-toggle dashboard: this page has one layout, not a customizable one.

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
const PHASE_ORDER = { funded: 0, p2: 1, p1: 2 };

// ---- Section 1: daily banner --------------------------------------------


/* THE BRIEF'S CLOCK, at two resolutions on purpose.
 *
 * Rhea's clock shows seconds, so it has to tick every second. The EVENT FILTER must not:
 * `filterBriefEvents` walks the whole feed and re-slices it by importance, currency and
 * time window, and running that 60 times a minute to redraw two digits is work nobody
 * asked for. The window it computes only changes by the minute anyway.
 *
 * So the hook returns both — `now` for display, and `minute` as a memo key that only
 * changes when the minute does. That is what lets the filter age events out of range on
 * its own (a "Next 4 Hours" list empties without a reload) at the cost of one filter
 * pass per minute rather than sixty.
 *
 * The first tick is aligned to the next second boundary so the displayed second flips
 * when the wall clock does, not up to 999ms afterwards. */
function useBriefClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, 1000 - (Date.now() % 1000));
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, []);
  return { now, minute: Math.floor(now.getTime() / 60_000) };
}

// Copy for each reason the event list came back empty, so the banner explains
// what to change instead of showing a dead-end "nothing found".
const EMPTY_EVENT_COPY = {
  'no-currencies': 'No currencies selected — pick at least one in Brief settings.',
  'filtered-out': 'No events match your Brief settings for this window.',
  /* THE COMMON CASE, AND IT USED TO SAY NOTHING USEFUL. The provider publishes the
     CURRENT WEEK ONLY (config.js has the verification), so from Friday evening until the
     new file lands there are genuinely no future releases — checked on a Friday at 22:00:
     two events left in the feed, neither high-impact. "No events on the calendar right
     now" reads as a bug in our app; this says what is actually true and when it changes. */
  'no-events': 'The economic calendar covers the current week only — next week\'s releases appear once it publishes.',
};

/* WHICH EMPTY SECTIONS `hideEmpty` MAY HIDE.
 *
 * The pref means "do not show me a section my own filter has emptied" — that is what a
 * user is asking for when they set it. It does not mean "hide it when the DATA is not
 * there": that is the app having nothing, and the trader should be told rather than
 * shown a card with a column missing. It matters because the data-gap case is the
 * common one (see above) and hiding it made the fallback and its explanation
 * unreachable — the column simply vanished, which is what the owner reported. */
const USER_EMPTIED = new Set(['filtered-out', 'no-currencies']);

// The feed's closed impact set (see normalizeImpact in src/platform/calendar.js)
// rendered as the badge that ends each event row. `low` is spelled out rather than
// left blank: a row with no badge reads as "unknown", not "unimportant".
const IMPACT_LABEL = { high: 'High', medium: 'Medium', low: 'Low', holiday: 'Holiday' };

// One glyph per severity, so an alert is recognisable before it is read. Nothing
// on the notification carries an icon, so severity is the only honest source —
// which also means the glyph can never disagree with the row's colour.
const ALERT_ICON = { crit: AlertTriangle, warn: Flag, info: Sparkles };

function AlertGlyph({ severity }) {
  const Icon = ALERT_ICON[sevClass(severity)] || Sparkles;
  return <Icon aria-hidden="true" />;
}

// Exported for the gitignored visual harness (frontend/.preview.jsx), which is the
// only way to SEE this card — there is no jsdom here, so nothing else renders it.
export function DailyBanner({
  notifications = [], prefs, patchBriefPrefs, setBriefSection, resetBriefPrefs,
  markNotificationRead,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const alerts = notifications.filter((n) => !n.read_at || n.severity !== 'info').slice(0, 4);

  // The full upcoming feed (global, via /api/calendar) — importance, currency and
  // time-window narrowing all happen here from the user's Brief prefs, so changing a
  // setting re-filters instantly with no refetch. null while loading; [] when the feed
  // is empty or errored — the brief never blocks.
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let live = true;
    fetchCalendar()
      .then((d) => { if (live) setEvents(d.events || []); })
      .catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, []);

  const { now, minute } = useBriefClock();
  /* `minute`, NOT `now`, IS THE MEMO KEY. See useBriefClock: the clock ticks every
     second and re-filtering the whole feed at that rate is pure waste, because the time
     window it computes only moves by the minute. `now` is still what gets filtered
     against — it is just not what decides whether to filter again.
     eslint-disable-next-line react-hooks/exhaustive-deps */
  const shown = useMemo(
    () => filterBriefEvents(events || [], prefs, now).slice(0, 8),
    [events, prefs, minute],
  );
  /* WHAT TO SHOW WHEN THE WINDOW IS QUIET. The user's window is usually a few hours, so
     on a slow afternoon the list is legitimately empty — and "nothing in the next four
     hours" only half-answers the question the column exists for. The fallback is the
     next HIGH-impact events from the whole feed, in the currencies they trade. It is
     labelled as a fallback rather than blended in, because a substitute list that looks
     like the real one teaches the trader their window setting does nothing. */
  const fallback = useMemo(
    () => (shown.length ? [] : fallbackBriefEvents(events || [], prefs, now)),
    [shown, events, prefs, minute],
  );
  /* SAMPLES, IN DEV BUILDS ONLY, and only when both real lists are empty.
   *
   * The provider publishes the current week only, so for a third of every week there is
   * genuinely nothing to render and the design cannot be looked at. `import.meta.env.DEV`
   * is statically replaced with `false` when Vite builds for production, so this branch
   * is dropped from the bundle — invented release times cannot reach a real trader, who
   * would reasonably plan a session around them. */
  const samples = useMemo(
    () => (import.meta.env.DEV && !shown.length && !fallback.length ? sampleBriefEvents(now) : []),
    [shown, fallback, minute],
  );
  const eventRows = shown.length ? shown : (fallback.length ? fallback : samples);
  const emptyReason = events == null ? null : briefEmptyReason(events, prefs, now);

  // A section is rendered when its toggle is on AND either it has content or the
  // user hasn't asked for empty sections to be hidden.
  const showEvents = briefSectionOn(prefs, 'events')
    && (!prefs.hideEmpty || eventRows.length > 0 || (events != null && !USER_EMPTIED.has(emptyReason)));
  const showAlerts = briefSectionOn(prefs, 'alerts') && (!prefs.hideEmpty || alerts.length > 0);
  // With everything hidden the brief would collapse to a bare title bar, which reads as
  // broken — say so instead.
  const allQuiet = !showEvents && !showAlerts;

  /* THE RANGE SWITCHER WRITES THE REAL PREF (owner decision, 2026-08-29).
   *
   * Rhea puts a Today / Week toggle on the events column. The app already had a
   * four-value time window in Brief settings, persisted per user through view-state, and
   * the two overlap exactly on two of those values. So the toggle IS that setting seen a
   * second time rather than a second setting: flipping it here moves the popover's
   * radio, survives a reload, and cannot end up disagreeing with it.
   *
   * The other two windows (4h, 24h) stay reachable in the popover. Rhea offers two
   * because two is what fits in 88px, not because the other two stopped being useful. */
  const RANGE = BRIEF_WINDOWS.filter((w) => w.id === 'today' || w.id === 'week')
    .map((w) => ({ id: w.id, label: w.id === 'week' ? 'Week' : 'Today' }));
  const rangeNote = BRIEF_WINDOWS.find((w) => w.id === prefs.window)?.label;

  return (
    <BriefCard>
      <BriefHeader
        title="Today's Brief"
        date={formatBriefDate(now, prefs.timezone)}
        clock={<BriefClock>{formatBriefClock(now, prefs.timezone)}</BriefClock>}
        action={(
          <div className="bs-anchor">
            <BriefAction
              // Icon-only, so the name lives here — there is no visible text left to
              // carry it.
              aria-label="Brief settings"
              title="Brief settings — currencies, impact, time window"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <SlidersHorizontal aria-hidden="true" />
            </BriefAction>
            <BriefSettingsPopover
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              prefs={prefs}
              patchBriefPrefs={patchBriefPrefs}
              setBriefSection={setBriefSection}
              resetBriefPrefs={resetBriefPrefs}
            />
          </div>
        )}
      />

      {allQuiet ? (
        <BriefColumns>
          <BriefNote>
            Every Brief section is hidden or empty — turn one back on in Brief settings.
          </BriefNote>
        </BriefColumns>
      ) : (
        <BriefColumns>
          {showEvents && (
            <BriefSection
              label={shown.length ? briefEventsLabel(prefs) : (samples.length ? 'Sample events' : 'Next high-impact events')}
              note={rangeNote}
              action={(
                <BriefRange
                  value={prefs.window}
                  options={RANGE}
                  onChange={(id) => patchBriefPrefs({ window: id })}
                />
              )}
            >
              {events == null ? (
                <BriefNote>Loading economic calendar…</BriefNote>
              ) : eventRows.length === 0 ? (
                <BriefNote>{EMPTY_EVENT_COPY[emptyReason] || EMPTY_EVENT_COPY['no-events']}</BriefNote>
              ) : eventRows.map((e, i) => (
                <BriefEvent
                  key={`${e.date}-${e.title}-${i}`}
                  currency={e.country}
                  title={e.title}
                  time={formatBriefTime(e.date, prefs.timezone, now)}
                  impact={e.impact}
                  impactLabel={IMPACT_LABEL[e.impact]}
                />
              ))}
              {!shown.length && fallback.length > 0 && (
                <BriefNote>Nothing inside your Brief window — showing the next high-impact releases instead.</BriefNote>
              )}
              {samples.length > 0 && (
                <BriefNote>Sample events — development build only. The live calendar covers the current week, which has no releases left.</BriefNote>
              )}
            </BriefSection>
          )}

          {showAlerts && (
            <BriefSection label="Account alerts">
              {alerts.length === 0 ? (
                <BriefNote>All clear — no active account alerts.</BriefNote>
              ) : alerts.map((n) => (
                <BriefAlert
                  key={n.id}
                  severity={n.severity}
                  icon={<AlertGlyph severity={n.severity} />}
                  title={n.title}
                  /* CLEAR MARKS IT READ — the same act the notification panel performs,
                     against the same route. The prototype clears into local component
                     state, which would give a dismissal that returns on reload and an
                     unread count disagreeing with the list beside it.
                     OFFERED ON EVERY ROW, not only unread ones: the brief shows read
                     alerts too (a read `warning` still means an account is near its
                     limit), and gating Clear on `read_at` meant the rows most likely to
                     be lingering were the ones with no way to dismiss them. */
                  onClear={markNotificationRead ? () => markNotificationRead(n.id) : undefined}
                >
                  {n.body || n.message || ''}
                </BriefAlert>
              ))}
            </BriefSection>
          )}
        </BriefColumns>
      )}
    </BriefCard>
  );
}

// Dashboard-level actions, sitting in the reserved strip between Today's Brief
// and the KPI row. Deliberately chrome-free — no panel, border or divider — so
// it reads as a control floating in whitespace rather than a third section.
//
// ONE CONTROL NOW. "Customize layout" sat at the other end and opened the layout
// editor; both are gone (2026-08-30) until every page is finalised. The strip stays
// because Sync Trades and the sync status still belong here, and it is the anchor the
// page's spacing is built around.
function DashActions({ lastSynced }) {
  return (
    <ActionStrip
      action={(
        /* SECONDARY, NOT PRIMARY (Rhea). It was a LIGHT fill — the page's one primary
           action — and Rhea draws it as a quiet bordered pill. Right, on reflection:
           the primary act on this page is READING it, and a white button at the top of
           a dashboard pulls the eye to a control most traders touch once a session, if
           the sync is not already automatic. */
        <Button variant="secondary" size="sm" pill type="button">
          <RefreshCw aria-hidden="true" />
          Sync Trades
        </Button>
      )}
      /* THE DESIGN'S SHAPE, WITH A TRUE VALUE IN IT. Rhea writes "Last synced: 2 min
         ago"; the app has no sync-status feed on this page, and printing an elapsed
         time with nothing behind it is a number a trader will act on ("it synced two
         minutes ago, so this P&L is current") when nothing has run.
         So the LABEL is the design's and the VALUE is whatever is true — "never" until
         a sync happens. That reads correctly the day the feed lands and never has to be
         un-lied about. */
      status={<ActionStatus>Last synced: {lastSynced || 'never'}</ActionStatus>}
    />
  );
}

// ---- Section 2: stat cards ------------------------------------------------
// Net P&L, Trade Win %, Profit Factor, Day Win %, Avg Win/Loss now live in
// KpiCards.jsx — the Trade Log shows four of the same five, and Net P&L is the
// locked master card whose geometry the others match, so a second copy of them
// would drift apart the first time either page was tuned.

// ---- Section 3 left: recent trades / open positions ----------------------

function OpenPositions() {
  return (
    <EmptyState
      title="No open positions data yet"
      description="The journal currently syncs closed trades only. Live open-position tracking will show up here once that's connected."
    />
  );
}

function ActivityCard({ trades, unit, beRounding }) {
  const [tab, setTab] = useState('recent');
  return (
    /* `flush`, AND THE TAB STRIP REPLACES THE HEADING. Rhea has no "Recent Activity"
       title above these tabs: the tabs ARE the title, and a heading over two tabs that
       each name themselves is the same word three times.
       The panel is flush because all three of its bands — the tab strip, the table
       header and the rows — reach the card's own edges. Padding them from the card
       would leave a gutter of --surface beside a header band that is supposed to span
       it, which is the one thing a table header must not do.
       THE CARD HAS A FIXED HEIGHT NOW (--dash-trades-h, the design's 374px), so the list
       can no longer be whatever six rows happen to come to. RecentTrades measures the
       room this card leaves it and renders as many whole rows as fit; the footer link
       sits OUTSIDE that flexing region, which is why it can no longer be pushed out of
       the bottom of the card the way it was. */
    <PanelCard flush>
      <PanelTabs>
        <PanelTab selected={tab === 'recent'} onClick={() => setTab('recent')}>Recent trades</PanelTab>
        <PanelTab selected={tab === 'open'} onClick={() => setTab('open')}>Open positions</PanelTab>
      </PanelTabs>
      {tab === 'recent' ? (
        <>
          <RecentTrades trades={trades} unit={unit} beRounding={beRounding} fit />
          {trades.length > 0 && (
            <PanelLink render={<Link to="/journal/trades" />}>
              View all trades
              <ArrowRight aria-hidden="true" />
            </PanelLink>
          )}
        </>
      ) : <OpenPositions />}
    </PanelCard>
  );
}

// Daily net cumulative P&L — running total of each day's closed P&L, so the
// line reads as an equity-style curve without needing a separate stats fetch
// (built straight off the same per-day rollup the calendar uses).
function CumulativePnlCard({ days, unit }) {
  const data = useMemo(() => {
    let cum = 0;
    return days.map((d) => {
      cum += d.pnl;
      return { label: fmtDate(d.date), cum: Math.round(cum * 100) / 100 };
    });
  }, [days]);

  const last = data.length ? data[data.length - 1].cum : 0;
  // Structural hue for the area (it sits under nothing), bright for the line (it is
  // drawn ON that area) — the §4 split, applied.
  const curveHue = last < 0 ? token('--loss-deep') : token('--profit-deep');
  const curveLine = last < 0 ? token('--loss-bright') : token('--profit-bright');
  return (
    /* Same as the activity card: the chart already declares its own height on the
       ResponsiveContainer, so `card-md` only added empty space beneath it. */
    <PanelCard>
      <PanelHead
        meta={(
          <PanelMeta tone={last > 0 ? 'pos' : last < 0 ? 'neg' : undefined}>
            {fmtVal(last, unit)}
          </PanelMeta>
        )}
      >
        Cumulative P&amp;L
        {/* THE UNIT IS A CHIP, NOT PART OF THE TITLE. It used to read "Daily net
            cumulative P&L" or "...R", so the heading itself changed when the top bar's
            toggle moved — a title that rewrites itself is a title a reader re-reads.
            Rhea puts the unit in a neutral badge beside it: the heading is stable, and
            the thing that actually changed is the thing that visibly changes. */}
        <PanelChip>{unit === 'USD' ? 'USD' : 'R multiple'}</PanelChip>
        <Explain>Running total of each day's closed P&amp;L, in order, across all trades.</Explain>
      </PanelHead>
      {data.length === 0 ? (
        <EmptyState title="No closed trades yet" description="Your cumulative P&L will chart here once you have closed trades." />
      ) : (
        /* THE CURVE IS SIGNED, AND THAT IS THE ONE REAL CHANGE HERE. It drew --profit
           whatever the account was doing, so a month that gave everything back plotted a
           green line falling off a cliff. The line and its fill take the sign of where
           the curve ENDS, which is the number printed in the head beside it — one fact,
           two encodings, never disagreeing.
           A single-series line is otherwise neutral (§4); this one is not a lone line,
           it is a P&L, and P&L has an outcome. */
        <div className="dash-equity-fill">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="dashEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={curveHue} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={curveHue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartPalette().grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={chartPalette().axis} fontSize={11} minTickGap={48} tickLine={false} axisLine={false} />
              <YAxis stroke={chartPalette().axis} fontSize={11} tickFormatter={(v) => fmtValShort(v, unit)} width={52} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={chartPalette().tip} formatter={(v) => fmtVal(v, unit)} labelStyle={{ color: chartPalette().label }} />
              {/* NO ENTER ANIMATION. recharts wipes the series in from zero width on
                  every mount, which means the equity curve is briefly absent every time
                  the unit toggle, a filter or the account scope changes — motion that
                  says nothing, on the one chart a trader checks to see whether they are
                  up. §10: animation settles, and this one had nothing to settle to. */}
              <Area
                type="monotone"
                dataKey="cum"
                stroke={curveLine}
                strokeWidth={2}
                fill="url(#dashEquityFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </PanelCard>
  );
}

// ---- Section 3 right: account health cards --------------------------------

const PHASE_LABEL = { funded: 'Funded', p2: 'Phase 2', p1: 'Phase 1' };

/* Attention glyph beside an account's name — ONLY for warn/bad.
 *
 * A healthy account gets NOTHING, and that is the point: zero emphasis is what makes
 * the two states that need attention visible. Warn is a triangle, critical a filled
 * alert-circle, so severity reads as a shape difference and not only as a colour — the
 * dot beside it already carries the hue, and a trader who cannot separate amber from
 * red would otherwise have one encoding of the fact that matters most.
 *
 * lucide since the 2026-08-28 rebuild; the two inline <svg> bodies this replaced drew
 * the same two glyphs at a hardcoded 12px. */
function AccountAlertIcon({ status }) {
  if (status === 'good') return null;
  const label = status === 'warn' ? 'Warning' : 'Critical';
  const Icon = status === 'warn' ? AlertTriangle : AlertCircle;
  return <Icon role="img" aria-label={label} />;
}

// Account header — a row of compact, tab-like account blocks (name / type /
// health), not buttons — each is a name/type block with a small status dot,
// separated from its neighbours by a hairline (matching the divider style of
// the metrics row below). Up to 3 shown; the rest sit behind a "+N Accounts"
// text link that opens the existing dropdown. Keeps the previously-selected
// block visible (swapping the third slot) rather than always showing the
// first 3 by phase order, so picking an account from the overflow menu
// doesn't make it disappear again.
function AccountHeader({ candidates, selectedId, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const firstThree = candidates.slice(0, 3);
  const selectedAcc = candidates.find((a) => String(a.account_id) === String(selectedId));
  const selInFirstThree = firstThree.some((a) => String(a.account_id) === String(selectedId));
  const visible = (!selectedAcc || selInFirstThree) ? firstThree : [...firstThree.slice(0, 2), selectedAcc];
  const visibleIds = new Set(visible.map((a) => String(a.account_id)));
  const overflow = candidates.filter((a) => !visibleIds.has(String(a.account_id)));

  return (
    <AccountTabs>
      {visible.map((a) => {
        const st = healthStatus(a.health.score, a.breach.breached);
        const active = String(a.account_id) === String(selectedId);
        return (
          <AccountTab
            key={a.account_id}
            tone={st}
            selected={active}
            alert={<AccountAlertIcon status={st} />}
            phase={PHASE_LABEL[a.phase] || a.phase}
            onClick={() => onSelect(a.account_id)}
          >
            {/* STACKED AGAIN (Rhea, 2026-08-29). The intermediate pass put these on one
                line as "#5521 · Phase 2" because a two-line tab was 48 tall against a
                36px rhythm. Rhea's chip is 60 tall and the row is the card's own header
                rather than a strip of tabs, so the phase gets its own line — which is
                what it wanted: it is the answer to "which stage of this challenge am I
                in", not a disambiguator on the name. */}
            {a.label || `Account ${a.account_id}`}
          </AccountTab>
        );
      })}
      {overflow.length > 0 && (
        <div className="dash-acct-more" ref={ref}>
          <AccountTabMore onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronDown aria-hidden="true" />
            +{overflow.length} Account{overflow.length > 1 ? 's' : ''}
          </AccountTabMore>
          {open && (
            <div className="wcz-menu dash-acct-more-menu">
              {overflow.map((a) => (
                <button
                  key={a.account_id}
                  type="button"
                  className="wcz-opt"
                  onClick={() => { onSelect(a.account_id); setOpen(false); }}
                >
                  <span>{a.label || `Account ${a.account_id}`}</span>
                  {a.phase && <span className="muted">{PHASE_LABEL[a.phase] || a.phase}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </AccountTabs>
  );
}

// Lets a trader set a manual profit target on a funded account (which carries
// no target by default — see profitTargetState in src/domain/prop/prop.js). Writes
// `profit_target_pct` on the account via the existing PATCH /api/accounts/:id
// route (which already mirrors it onto the active challenge), so once saved
// the account picks up the exact same "Profit target" meter eval accounts use.
function SetTargetModal({
  acct, startBalance, isEdit = false, initialMode = 'pct', initialValue = '', onClose, onSaved,
}) {
  const [mode, setMode] = useState(initialMode);
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function save(e) {
    e.preventDefault();
    const n = Number(value);
    if (!(n > 0)) { setErr('Enter a target greater than 0.'); return; }
    let pct;
    if (mode === 'pct') {
      pct = n;
    } else if (startBalance > 0) {
      pct = (n / startBalance) * 100;
    } else {
      setErr('This account has no starting balance to base a dollar target on.');
      return;
    }
    setBusy(true); setErr(null);
    try {
      await updateAccount(acct.id, { profit_target_pct: pct });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove this payout target? The account will go back to tracking profit with no target.')) return;
    setBusy(true); setErr(null);
    try {
      await updateAccount(acct.id, { profit_target_pct: null });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="target-modal" label={isEdit ? 'Edit payout target' : 'Set payout target'}>
        <div className="modal-head">
          <h3>{isEdit ? 'Edit payout target' : 'Set payout target'}</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        <form className="payout-add" onSubmit={save}>
          <Tabs
            tabs={[{ value: 'pct', label: '% of balance' }, { value: 'amount', label: '$ amount' }]}
            value={mode}
            onChange={(m) => { setMode(m); setErr(null); }}
          />
          <label className="po-field">
            <span>{mode === 'pct' ? 'Payout target (% of starting balance)' : 'Payout target ($ amount)'}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === 'pct' ? '10' : '2500'}
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Update target' : 'Save target'}</button>
          {isEdit && (
            <button type="button" className="danger-link" disabled={busy} onClick={remove}>Remove target</button>
          )}
          {err && <div className="login-error">{err}</div>}
        </form>
    </Modal>
  );
}

// The dashboard's single primary account card — spans the full width, with an
// account header (tab row) so switching which account you're looking at
// doesn't require leaving the page.
function AccountCard({
  data, candidates, selectedId, onSelect, onOpen, accounts, onChanged, onLocked,
}) {
  const [targetOpen, setTargetOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const acctRecord = accounts.find((a) => String(a.mt5_login) === String(data.account_id));

  async function lockAccount() {
    if (!acctRecord) return;
    // eslint-disable-next-line no-alert
    if (!confirm(
      `Lock ${acctRecord.label || `account ${data.account_id}`}?\n\n`
      + 'PropVexis cannot disable the account at your prop firm — only your firm can do '
      + 'that. Locking here stops PropVexis tracking it: it leaves the account switcher '
      + 'and every total, so you are not reading figures from an account you should not '
      + 'be trading.\n\nYou can unlock it from Settings › Accounts.',
    )) return;
    setLocking(true);
    try {
      await updateAccount(acctRecord.id, { is_active: false });
      // BOTH reloads: the prop engine's view of the account AND the account list the
      // scope switcher reads. Reloading one leaves the locked account still selectable
      // in the top bar, which is the half of "stops tracking it" that matters most.
      onChanged();
      onLocked();
    } finally {
      setLocking(false);
    }
  }

  /* THE STOP-TRADING BANNER FIRES ON THE SAME SIGNAL THE METERS DO, so it can never
   * disagree with them: `breached` is the account already gone, and `bad` is
   * roomStatus() saying under 25% of the daily limit is left. There is no second
   * threshold here for the banner to drift away from.
   *
   * The message names the account and the number, because "stop trading" without a
   * reason is an instruction a trader will override. */
  const dayTone = healthStatus(data.health.score, data.breach.breached);
  const critical = data.breach.breached || dayTone === 'bad';

  return (
    /* NO HEADING. The design opens this card on the account chips, and it is right to:
       the chips say which account, the meters say how it is doing, and a "Account
       Health" title above them is the card narrating itself — DESIGN-LANGUAGE §24, "a
       label is not a heading". Nothing else on the page identifies this card, and
       nothing needs to; it is the only one with account chips in it. */
    <AccountCardShell critical={critical}>
      <AccountHeader candidates={candidates} selectedId={selectedId} onSelect={onSelect} />

      {critical && (
        <AccountBanner
          icon={<AlertTriangle aria-hidden="true" />}
          label="Stop trading zone"
          /* LOCK ACCOUNT IS REAL, AND IT DOES THE ONE REAL THING AVAILABLE.
           *
           * PropVexis cannot reach into a prop firm and disable a login — no connector
           * does that, and a button that pretends to would be the worst possible lie on
           * the worst possible banner. What it CAN do is stop tracking the account here:
           * `is_active = false`, the same soft archive Settings › Accounts has always
           * offered, which removes it from the scope switcher and every aggregate so a
           * trader is not staring at a dead account's figures.
           *
           * The confirm says exactly that, in those words, so nobody clicks it believing
           * their broker just got a message. It is reversible from Settings. */
          action={acctRecord && (
            <AccountBannerAction onClick={lockAccount} disabled={locking}>
              {locking ? 'Locking…' : 'Lock account'}
            </AccountBannerAction>
          )}
        >
          {data.breach.breached
            ? `${data.label || `Account ${data.account_id}`} has breached its rules.`
            : `${data.label || `Account ${data.account_id}`} is close to today's loss limit.`}
        </AccountBanner>
      )}

      {/* The three rule meters live in AccountDetails.jsx — Accounts › Details renders
          the same section, and one component is what keeps the two from drifting. This
          page keeps the target-editing flow (SetTargetModal below), which it hands in;
          a surface without that flow passes nothing. */}
      <AccountDetails
        data={data}
        onSetTarget={acctRecord ? () => setTargetOpen(true) : null}
      />

      {/* The day count appears ONCE — here. The frame prints it twice, in the header
          and again in the footer; the same seven words in two places inside one card
          teaches the reader that neither is worth reading. */}
      <AccountCardFoot
        action={(
          <AccountCardLink onClick={onOpen}>
            View account
            <ArrowRight aria-hidden="true" />
          </AccountCardLink>
        )}
      >
        <CalendarDays aria-hidden="true" />
        {/* The count is mono because it is a figure; the words are not. Rhea splits
            them so a glance lands on "7/10" rather than on the sentence around it. */}
        <AccountFootFigure>{data.tradingDays.completed}/{data.tradingDays.required}</AccountFootFigure>
        days completed
        <AccountFootRule />
        <span>Minimum trading days requirement</span>
      </AccountCardFoot>

      {targetOpen && acctRecord && (
        <SetTargetModal
          acct={acctRecord}
          startBalance={data.startBalance}
          isEdit={!!data.profitTarget}
          initialMode={data.profitTarget ? 'amount' : 'pct'}
          initialValue={data.profitTarget ? String(data.profitTarget.target) : ''}
          onClose={() => setTargetOpen(false)}
          onSaved={() => { setTargetOpen(false); onChanged(); }}
        />
      )}
    </AccountCardShell>
  );
}

/* THE LOADING DASHBOARD, on the 2026-08-28 frame (node 44:2).
 *
 * It mirrors the real page rather than replacing it with a spinner: the brief's two
 * columns, the KPI row's five cards, the account card's three meters, the calendar and
 * the activity list all sit where they will sit, in the real card shells. That is the
 * frame's decision and it is the right one — a full-page spinner makes every load feel
 * like a page change, and a layout that visibly rearranges when data lands teaches a
 * trader not to trust what they are reading until it stops moving.
 *
 * IT IS SHOWN FOR A REAL SIGNAL, not a timer. `tradesLoading` is threaded from App and
 * starts true; before this existed the page could not tell "your data is three seconds
 * away" from "you have never traded", and showed the second to both.
 */
// Exported for the gitignored visual harness (frontend/.preview.jsx), which is the only
// way to SEE this state — there is no jsdom here, and reproducing it in the app means
// throttling a network request.
export function DashSkeleton() {
  return (
    <SkeletonRegion label="Loading dashboard" className="dash-skeleton">
      <BriefCard>
        <BriefHeader
          title="Today's Brief"
          date={<SkeletonLine w="7rem" />}
          action={<LoadingNote><Loader2 aria-hidden="true" className="animate-spin" />Loading brief…</LoadingNote>}
        />
        <BriefColumns>
          {/* `scroll={false}`: a skeleton must not put a scrollbar on placeholder rows.
              The heights are the real ones — 33px events, 73px alerts — so the card
              reserves the box its content will occupy and nothing jumps when data
              lands, which is the whole point of drawing skeletons in the real shell. */}
          <BriefSection label={<SkeletonLine w="8rem" />} scroll={false}>
            {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} h="33px" radius={10} />)}
          </BriefSection>
          <BriefSection label={<SkeletonLine w="8rem" />} scroll={false}>
            {[0, 1].map((i) => <SkeletonBlock key={i} h="73px" radius={10} />)}
          </BriefSection>
        </BriefColumns>
      </BriefCard>

      <KpiRow>
        {/* THE NON-HERO CARDS ARE A FLEX ROW NOW (label+value on the left, a gauge on
            the right), so their skeletons have to stack inside KpiMain or the three
            placeholder lines lay themselves out horizontally — which is exactly how
            this first rendered. A skeleton that reserves a different SHAPE from its
            content is the layout jump it exists to prevent. */}
        {/* TWO LINES, because the hero has two children — a label row and a figure. It
            drew three around a spacer, which reserved a third line the card no longer
            has and pushed the figure to the floor the card no longer puts it on: the
            skeleton was mirroring a layout that had already changed underneath it. */}
        <KpiCard hero>
          <SkeletonLine w="5rem" />
          <SkeletonLine w="9rem" h="1.75rem" />
        </KpiCard>
        {[1, 2, 3, 4].map((i) => (
          <KpiCard key={i}>
            <KpiMain>
              <SkeletonLine w="6rem" />
              <SkeletonLine w="7rem" h="1.75rem" />
            </KpiMain>
            <KpiAside>
              <SkeletonBlock h="2.6rem" w="4.6rem" radius={8} />
            </KpiAside>
          </KpiCard>
        ))}
      </KpiRow>

      <AccountCardShell>
        {/* The heading is gone from the real card, so it goes from its skeleton too —
            a placeholder for a title that never arrives is a layout jump on load. */}
        <AccountTabs>
          {/* `w` as a prop, not a class: a Tailwind width written in this file would
              compile to nothing — see SkeletonBlock. */}
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} h="2.25rem" w="10rem" radius={6} />)}
        </AccountTabs>
        <MeterRow>
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} h="8.5rem" radius={16} />)}
        </MeterRow>
      </AccountCardShell>

      {/* THE SAME TWO COLUMNS AND THE SAME THREE HEIGHTS as the real page — see
          DashMain. A skeleton that reserves a different box from its content is the
          layout jump it exists to prevent (§15), and these boxes are now fixed, so
          there is no excuse for them to disagree. */}
      <div className="dash-main-grid">
        <div className="dash-cal-cell">
          <PanelCard>
            <PanelHead sub={<SkeletonLine w="7rem" />}><SkeletonLine w="9rem" h="1rem" /></PanelHead>
            <SkeletonBlock h="16rem" radius={12} />
          </PanelCard>
        </div>
        <div className="dash-side">
          <div className="dash-trades-cell">
            <PanelCard>
              <PanelHead><SkeletonLine w="8rem" h="1rem" /></PanelHead>
              {[0, 1, 2, 3, 4].map((i) => (
                <PanelRow key={i}><SkeletonLine w={`${60 + i * 8}%`} /></PanelRow>
              ))}
            </PanelCard>
          </div>
          <div className="dash-chart-cell">
            <PanelCard>
              <PanelHead><SkeletonLine w="8rem" h="1rem" /></PanelHead>
              <SkeletonBlock h="10rem" radius={12} />
            </PanelCard>
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

// ---- page ------------------------------------------------------------------

export default function Dashboard() {
  const {
    trades = [], tradesLoading = false, accounts = [], accountId = 'all', setAccountId,
    reloadAccounts = () => {},
    unit = 'R', notifications = [], pinnedAccounts = [], setPinnedAccounts, tradeSettings = {},
    briefPrefs, patchBriefPrefs, setBriefSection, resetBriefPrefs, markNotificationRead,
  } = useOutletContext();
  const brief = briefPrefs || defaultBriefPrefs();

  const beRounding = !!tradeSettings.beRounding;

  /* "LAST SYNCED" FROM THE DATA, NOT FROM A FEED WE DO NOT HAVE. There is no sync-status
   * endpoint, but the newest ingested trade IS evidence that a sync happened and when —
   * so this reports the freshest thing the app actually knows. It says "never" with no
   * trades, which is exactly right for a new account, and it stops being a guess the day
   * a real sync feed lands: the label does not change, only its source. */
  const lastSynced = useMemo(() => {
    let newest = 0;
    for (const t of trades) {
      const at = new Date(t.close_time || 0).getTime();
      if (at > newest) newest = at;
    }
    if (!newest) return null;
    const mins = Math.max(0, Math.round((Date.now() - newest) / 60_000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(newest).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [trades]);
  const m = useMemo(() => computeMetrics(trades, unit, beRounding), [trades, unit, beRounding]);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const dayMap = useMemo(() => {
    const map = new Map();
    for (const d of m.days) map.set(d.key, { pnl: d.pnl, trades: d.trades, wins: d.wins, losses: d.losses });
    return map;
  }, [m.days]);

  // Day win % — the share of trading days that closed net positive, distinct
  // from the trade-level win rate above.
  const dayStats = useMemo(() => {
    const winDays = m.days.filter((d) => d.pnl > 0).length;
    const lossDays = m.days.filter((d) => d.pnl < 0).length;
    const total = m.days.length;
    return { rate: total ? (100 * winDays) / total : 0, winDays, lossDays, total };
  }, [m.days]);

  // Prop OS challenge state for the account-health cards — same call PropOS
  // itself makes; a multi-account scope returns one item per account, single one.
  const [propData, setPropData] = useState(null);
  function loadProp() {
    fetchProp(accountId).then((d) => setPropData(d)).catch(() => {});
  }
  useEffect(() => { setPropData(null); loadProp(); /* eslint-disable-next-line */ }, [accountId]);

  const candidates = useMemo(() => {
    const list = (propData?.multi ? propData.accounts : propData ? [propData] : []).filter((a) => a.challengeId);
    return [...list].sort((a, b) => (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9));
  }, [propData]);

  // Single selected prop account for the account card — persisted the same way
  // the old pinned-accounts stack was, just to one id instead of up to three.
  const selectedAccount = useMemo(() => {
    if (!candidates.length) return null;
    const pinnedId = pinnedAccounts[0];
    const found = pinnedId != null ? candidates.find((a) => String(a.account_id) === String(pinnedId)) : null;
    return found || candidates[0];
  }, [candidates, pinnedAccounts]);

  /* Account Health, which is the one card with two whole arrangements — an empty state
   * and the real thing. Named rather than inlined for that reason alone; every other
   * card on this page is one element at its call site below. */
  const accountSection = (!selectedAccount ? (
      <AccountCardShell>
        <EmptyState
          title="No prop accounts yet"
          description="Add a prop account with challenge rules to see drawdown and profit-target tracking here."
        />
      </AccountCardShell>
    ) : (
      <AccountCard
        data={selectedAccount}
        candidates={candidates}
        selectedId={selectedAccount.account_id}
        onSelect={(id) => setPinnedAccounts([id])}
        onOpen={() => setAccountId(String(selectedAccount.account_id))}
        accounts={accounts}
        onChanged={loadProp}
        onLocked={reloadAccounts}
      />
    ));

  /* THE PAGE IS THE DESIGN'S ARRANGEMENT, WRITTEN DOWN (2026-08-30).
   *
   * It used to be data: a stored layout of reorderable sections and show/hide widgets,
   * with each card taking its height from its GRID SPAN via `lg = 2 x md + gap`. That
   * indirection is what made the design's own heights unreachable — the design draws
   * the calendar at 780, Recent trades at 374 and the chart at 390, and 374 != 390, so
   * no single "card unit" can produce them. A configurable grid can only offer equal
   * cards; the design does not use equal cards.
   *
   * Customization is removed until every page is finalised (owner decision), so the
   * arrangement is plain JSX and the three heights are three tokens. The right column
   * still sums to the left one — 374 + 16 + 390 = 780 — which is the alignment the
   * design draws, and app.css derives the calendar from that sum rather than repeating
   * the number.
   *
   * Two columns, 67/33, exactly as the prototype's `minmax(0,67fr) minmax(0,33fr)`. It
   * was three columns with the calendar spanning two, which is the same ratio reached
   * the long way round — an artifact of needing arbitrary widget footprints. */
  const stripAfter = 'brief';

  if (tradesLoading) {
    return (
      <div className="page">
        <div className="page-body dash-page-body"><DashSkeleton /></div>
      </div>
    );
  }

  return (
    <div className="page">
      <DayTradesModal
        dayKeyStr={selectedDay}
        trades={trades}
        unit={unit}
        beRounding={beRounding}
        onClose={() => setSelectedDay(null)}
      />

      <div className="page-body dash-page-body">
        <DailyBanner
          notifications={notifications}
          prefs={brief}
          patchBriefPrefs={patchBriefPrefs}
          setBriefSection={setBriefSection}
          resetBriefPrefs={resetBriefPrefs}
          markNotificationRead={markNotificationRead}
        />

        <DashActions lastSynced={lastSynced} />

        {/* KpiRow re-splits itself from a content floor, so there is no column count to
            keep in sync — see the header on kpi.jsx. */}
        <KpiRow>
          <NetPnlCard m={m} unit={unit} />
          <TradeWinCard m={m} />
          <ProfitFactorCard m={m} />
          <DayWinCard days={dayStats} />
          <AvgWinLossCard m={m} unit={unit} />
        </KpiRow>

        <div className="dash-main-grid">
          {/* Full width, and sized by its content: Account Health has no neighbour to
              line up with, and pinning it to a card height leaves dead surface under
              its footer. */}
          <div className="dash-account-cell">{accountSection}</div>

          <div className="dash-cal-cell">
            <PanelCard className="dash-cal-panel">
              <MonthCalendar
                year={calYear}
                month={calMonth}
                dayMap={dayMap}
                unit={unit}
                onPrev={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                onNext={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                onToday={() => { const n = new Date(); setCalYear(n.getFullYear()); setCalMonth(n.getMonth()); }}
                onSelectDay={(c) => setSelectedDay(c.key)}
                // See MonthCalendar's `weeks`: this calendar shares a row with two other
                // cards, so the eighth column costs width the days need. Prop OS keeps it.
                weeks={false}
              />
              <PanelHint>Click a day to open that session&rsquo;s trades.</PanelHint>
            </PanelCard>
          </div>

          <div className="dash-side">
            <div className="dash-trades-cell">
              <ActivityCard trades={trades} unit={unit} beRounding={beRounding} />
            </div>
            <div className="dash-chart-cell">
              <CumulativePnlCard days={m.days} unit={unit} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
