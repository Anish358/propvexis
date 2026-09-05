import React, {
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowRight, CalendarDays, ChevronDown, Clock, Flag,
  Loader2, RefreshCw, SlidersHorizontal, Sparkles,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip } from 'recharts';
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
  BANNER_CRITICAL, AccountCardFoot, AccountCardLink, AccountCardShell,
  Menu, MenuContent, MenuItem, MenuTrigger,
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
  filterBriefEvents, briefEmptyReason,
  briefSectionOn, formatBriefTime,
  defaultBriefPrefs, formatBriefDate, formatBriefClock, BRIEF_WINDOWS,
} from './briefPrefs.js';
import { sevClass } from '../alerts/Notifications.jsx';
import { NetPnlCard, TradeWinCard, ProfitFactorCard, DayWinCard, AvgWinLossCard } from './KpiCards.jsx';
import { healthStatus } from '../prop/PropOS.jsx';
import { tradingDaysRead } from '../prop/propAccounts.js';
import AccountAlertBanner from '../prop/AccountAlertBanner.jsx';
import { accountAlertFor } from '../prop/accountAlert.js';
import AccountDetails from '../prop/AccountDetails.jsx';
import RecentTrades from '../trades/RecentTrades.jsx';
import {
  fetchProp, updateAccount, fetchCalendar, fetchSyncStatus, syncNow,
} from '../../lib/api.js';
import { chartPalette, token } from '../../lib/theme.js';
import { cumulativeSeries, pnlAxis } from './cumulativePnl.js';
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
  /* UNREAD ONLY, AND THAT IS WHAT MAKES Clear WORK (2026-08-30).
   *
   * This read `!n.read_at || n.severity !== 'info'` — keep it if unread, OR if it is
   * anything more serious than info. The reasoning was sound in isolation: a read
   * `warning` still means an account is near its limit, so why hide it?
   *
   * But Clear marks the alert read, and for every warning and critical row — which is
   * every row a trader would want to clear — that predicate is still true afterwards.
   * The row stayed exactly where it was. The unread count dropped and the alert was
   * genuinely marked read server-side, so nothing was broken underneath; it simply did
   * nothing a user could see, which is the same thing as being broken.
   *
   * A control named Clear has to clear. The alert is not destroyed — it stays in the
   * notification panel and the Alerts page, which is where a read-but-still-true
   * warning belongs. The brief is a summary of what needs attention NOW. */
  // NOT CAPPED. The section scrolls (BriefSection, max-h-[153px]), so a cap hides rows
  // with no affordance at all — the scrollbar is the affordance.
  const alerts = notifications.filter((n) => !n.read_at);

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
  /* WHAT THE WINDOW SAYS IS WHAT THE LIST SHOWS — nothing more, nothing else, no cap.
   *
   * THREE THINGS USED TO SIT BETWEEN THE FILTERS AND THE ROWS, and together they made
   * the column untrustworthy:
   *
   *   a `.slice(0, 8)` cap, on a list that already scrolls;
   *
   *   a FALLBACK — when the window was empty it silently substituted the next
   *   high-impact events from the WHOLE feed, ignoring the window entirely. On a
   *   Sunday with "Today" selected that is what put Tuesday and Wednesday releases
   *   under a heading that said Today. It was labelled, but a label under a list that
   *   looks exactly like the real one is not enough: the window control appeared not to
   *   work, which is worse than an empty column;
   *
   *   and DEV-ONLY SAMPLE EVENTS — invented releases, to make the design visible in a
   *   week with no data left. Production never saw them, but they were one build flag
   *   from a trader planning a session around a release that does not exist.
   *
   * All three are gone. Today means today, Week means the week, and an empty window
   * says so. */
  const shown = useMemo(
    () => filterBriefEvents(events || [], prefs, now),
    [events, prefs, minute],
  );
  const emptyReason = events == null ? null : briefEmptyReason(events, prefs, now);

  /* A SECTION RENDERS ON ITS TOGGLE ALONE. Emptiness is a state it shows, not a reason
   * to disappear.
   *
   * These used to also require content (unless "Hide empty sections" was off, which it
   * was not by default), and the result was the bug: with no unread alerts the alerts
   * column vanished and BriefColumns' `:only-child` rule handed the whole card to the
   * calendar. A trader with a quiet inbox got a differently-shaped dashboard, and no
   * way to tell whether the alerts panel was empty or broken.
   *
   * An empty column that says "No alerts" answers the question. A missing one does not.
   * `hideEmpty` is deleted with this — see briefPrefs.js. */
  const showEvents = briefSectionOn(prefs, 'events');
  const showAlerts = briefSectionOn(prefs, 'alerts');
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
              /* ONE NAME, ALWAYS. §3: a title must not rewrite itself — if a control
                 elsewhere changes what a card shows, the change goes in a chip beside
                 the title, not in the title. This read "High-impact events" or "High &
                 medium events" off the importance setting, and "Next high-impact
                 events" whenever the fallback was showing, so the column was named
                 after its filter and changed identity under the user. The filters live
                 in the note and the range switcher beside it; the column is the
                 economic calendar whatever is filtered out of it. */
              label="Economic calendar"
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
              ) : shown.length === 0 ? (
                <BriefNote>{EMPTY_EVENT_COPY[emptyReason] || EMPTY_EVENT_COPY['no-events']}</BriefNote>
              ) : shown.map((e, i) => (
                <BriefEvent
                  key={`${e.date}-${e.title}-${i}`}
                  currency={e.country}
                  title={e.title}
                  time={formatBriefTime(e.date, prefs.timezone, now)}
                  impact={e.impact}
                  impactLabel={IMPACT_LABEL[e.impact]}
                />
              ))}
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
                     EVERY ROW HERE IS UNREAD (see the filter above), so Clear is
                     offered on all of them and always removes the one it is on. */
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
function DashActions({ lastSynced, onSync, syncing, syncNote }) {
  return (
    <ActionStrip
      action={(
        /* NOT PRIMARY (Rhea). It was a LIGHT fill — the page's one primary action — and
           Rhea draws it as a quiet FILLED pill. Right, on reflection: the primary act on
           this page is READING it, and a white button at the top of a dashboard pulls
           the eye to a control most traders touch once a session.

           `tinted`, NOT `secondary`. The design draws this at #16161a behind #26262b —
           which is exactly what --control-bg-strong is for; tokens.css names this very
           button in that token's comment ("a FILLED quiet button — Sync Trades, This
           month, Import"). `secondary` + `pill` resolved to --control-bg (#131316), the
           TOP BAR's resting surface, so it sat a step darker than the design and read as
           chrome rather than as an action. Same treatment as the account switcher, which
           is correct: they are the same kind of control. */
        <Button
          variant="tinted"
          size="sm"
          pill
          type="button"
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw aria-hidden="true" />
          {syncing ? 'Syncing…' : 'Sync Trades'}
        </Button>
      )}
      /* THE DESIGN'S SHAPE, WITH A TRUE VALUE IN IT. Rhea writes "Last synced: 2 min
         ago". The value now comes from the sync jobs themselves rather than from the
         newest trade — those are different facts, and the old one lied in both
         directions: a successful sync that found nothing new left it reading "never",
         and an account whose last trade was on Friday reported that as the sync time.
         `syncNote` is what the last press actually did, which is the only way a user
         can tell "nothing to fetch" from "the button does nothing". */
      status={<ActionStatus>{syncNote || `Last synced: ${lastSynced || 'never'}`}</ActionStatus>}
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
  const data = useMemo(() => cumulativeSeries(days, fmtDate), [days]);
  const { domain, ticks, zeroOffset } = useMemo(() => pnlAxis(data), [data]);
  /* THE GRADIENT IDS ARE PER-INSTANCE. They used to be two literal strings, which was
     harmless while the offsets were constant and is not any more: SVG ids are
     DOCUMENT-global, so two of these cards on one page would both resolve the same
     url(#...) to whichever rendered first, and the second chart would split its colours
     at the first chart's zero line. Caught in the visual harness, where four of them
     sit side by side. */
  const uid = useId().replace(/:/g, '');
  const fillId = `dashEquityFill-${uid}`;
  const lineId = `dashEquityLine-${uid}`;

  const last = data.length ? data[data.length - 1].cum : 0;
  // Structural hues for the area (it sits under nothing), bright for the line (it is
  // drawn ON that area) — the §4 split, applied to both signs.
  const upHue = token('--profit-deep');
  const downHue = token('--loss-deep');
  const upLine = token('--profit-bright');
  const downLine = token('--loss-bright');
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
      {/* KEYED ON `days`, NOT `data` — the series always carries its leading zero point
          now, so `data` is never empty and the empty state would never show. */}
      {days.length === 0 ? (
        <EmptyState title="No closed trades yet" description="Your cumulative P&L will chart here once you have closed trades." />
      ) : (
        /* THE CURVE IS SIGNED POINT BY POINT, not as a whole. It first drew --profit
           whatever the account was doing; it then took the sign of where the curve
           ENDED, which is better but still one colour for a series that changes sign —
           a month that went $4,000 up and gave $5,000 back drew its profitable half in
           red. Green is now above zero and red below it, on the same line, because the
           sign of a cumulative P&L is a property of every point in it.
           A single-series line is otherwise neutral (§4); this one is not a lone line,
           it is a P&L, and P&L has an outcome. */
        <div className="dash-equity-fill">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              {/* BOTH GRADIENTS SPLIT AT THE SAME OFFSET — the fraction of the plotted
                  band that sits above zero, computed in cumulativePnl.js from the very
                  domain handed to the YAxis below. The fill fades to nothing AT that
                  line rather than at the card's edges, so the ink is densest where the
                  curve is furthest from break-even; the stroke changes hue there with
                  no fade, because a line that dissolves at zero stops being a line. */}
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor={upHue} stopOpacity={0.55} />
                  <stop offset={zeroOffset} stopColor={upHue} stopOpacity={0.04} />
                  <stop offset={zeroOffset} stopColor={downHue} stopOpacity={0.04} />
                  <stop offset={1} stopColor={downHue} stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id={lineId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor={upLine} />
                  <stop offset={zeroOffset} stopColor={upLine} />
                  <stop offset={zeroOffset} stopColor={downLine} />
                  <stop offset={1} stopColor={downLine} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartPalette().grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={chartPalette().axis} fontSize={11} minTickGap={48} tickLine={false} axisLine={false} />
              {/* THE DOMAIN AND TICKS ARE OURS, NOT RECHARTS'. Its own padded domain
                  would put zero somewhere other than `zeroOffset`, and the colours
                  would change hue at a height the curve does not cross zero at. */}
              <YAxis
                stroke={chartPalette().axis}
                fontSize={11}
                domain={domain}
                ticks={ticks}
                tickFormatter={(v) => fmtValShort(v, unit)}
                width={52}
                tickLine={false}
                axisLine={false}
              />
              {/* Break-even, drawn once and solid, so the two fills have a stated edge
                  to meet at rather than only a colour change. */}
              <ReferenceLine y={0} stroke={chartPalette().axis} strokeWidth={1} />
              <Tooltip contentStyle={chartPalette().tip} formatter={(v) => fmtVal(v, unit)} labelStyle={{ color: chartPalette().label }} />
              {/* NO ENTER ANIMATION. recharts wipes the series in from zero width on
                  every mount, which means the equity curve is briefly absent every time
                  the unit toggle, a filter or the account scope changes — motion that
                  says nothing, on the one chart a trader checks to see whether they are
                  up. §10: animation settles, and this one had nothing to settle to. */}
              {/* baseValue={0} IS WHAT MAKES THE SPLIT TRUE. An area fills to the
                  BOTTOM of the plot by default, so a curve sitting at +$3,000 would
                  wash the whole band beneath it — straight through the red half —
                  and the gradient would colour that wash rather than the P&L. */}
              <Area
                type="monotone"
                dataKey="cum"
                baseValue={0}
                stroke={`url(#${lineId})`}
                strokeWidth={2}
                fill={`url(#${fillId})`}
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
      {/* THE OVERFLOW IS THE `Menu` PRIMITIVE NOW, and it had to become one.
          It was a hand-rolled `position: absolute` panel inside this strip, and two
          things were wrong with that. Its wrapper carried no `position: relative`, so
          the panel resolved against whatever ancestor happened to be positioned and
          landed over the SIDEBAR, on the far side of the page from the button that
          opened it. And `AccountTabs` is `overflow-x-auto` — a scroll container clips
          anything absolutely positioned inside it, so even correctly anchored the panel
          would have been cut off at the strip's edge.
          `Menu` is portaled and viewport-aware, so neither is reachable: it anchors to
          its trigger, flips rather than running off an edge, and escapes the scroller
          entirely. It also brings what the hand-rolled version never had — Escape to
          close, focus returned to the trigger, arrow-key and typeahead navigation, and
          aria-haspopup/aria-expanded kept in sync — which is the build order's whole
          argument for reaching for a primitive before writing a panel. */}
      {overflow.length > 0 && (
        <Menu>
          <MenuTrigger render={<AccountTabMore />}>
            <ChevronDown aria-hidden="true" />
            +{overflow.length} Account{overflow.length > 1 ? 's' : ''}
          </MenuTrigger>
          {/* `align="start"` so it hangs under the chip's LEFT edge: this trigger sits at
              the right end of a horizontal strip, and the default end-alignment pushed
              the panel further right again, off the card. */}
          <MenuContent align="start" className="dash-acct-more-menu">
            {overflow.map((a) => {
              const st = healthStatus(a.health.score, a.breach.breached);
              return (
                <MenuItem key={a.account_id} onClick={() => onSelect(a.account_id)}>
                  {/* THE ROW IS THE CHIP, SMALLER. An account in this menu is the same
                      object as one in the strip beside it, so it carries the same three
                      facts in the same order — health, name, phase. The dot is the
                      chip's health ring reduced to its inner mark; `prop-*` sets
                      --status, which is the tone vocabulary the meters and the rail
                      already share. */}
                  <span className={`dash-acct-menu-row prop-${st}`}>
                    <span className="dash-acct-menu-dot" aria-hidden="true" />
                    <span className="dash-acct-menu-name">
                      {a.label || `Account ${a.account_id}`}
                    </span>
                    {a.phase && (
                      <span className="dash-acct-menu-phase">{PHASE_LABEL[a.phase] || a.phase}</span>
                    )}
                  </span>
                </MenuItem>
              );
            })}
          </MenuContent>
        </Menu>
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

  /* THE BANNER NAMES THE RULE IT IS ABOUT, and that is the change here.
   *
   * It used to fire on `healthStatus(...) === 'bad'` — a blended 0-100 score over three
   * meters — while its copy read "is close to today's loss limit", a sentence that
   * could be false at the moment it appeared: the score also falls to `bad` on max
   * drawdown alone, or on a breach that happened days ago. Six explicit states now live
   * in features/prop/accountAlert.js, each reading ONE rule and quoting its number.
   *
   * THE CARD'S RED EDGE FOLLOWS THE BANNER'S OWN SEVERITY, from the banner's own set —
   * so a green "phase passed" strip can never sit inside a red-edged card, and the two
   * cannot drift apart the way the old copy drifted from its trigger. */
  const alert = accountAlertFor(data);
  const critical = alert ? BANNER_CRITICAL.has(alert.tone) : false;
  const days = tradingDaysRead(data.tradingDays);

  return (
    /* NO HEADING. The design opens this card on the account chips, and it is right to:
       the chips say which account, the meters say how it is doing, and a "Account
       Health" title above them is the card narrating itself — DESIGN-LANGUAGE §24, "a
       label is not a heading". Nothing else on the page identifies this card, and
       nothing needs to; it is the only one with account chips in it. */
    <AccountCardShell critical={critical}>
      <AccountHeader candidates={candidates} selectedId={selectedId} onSelect={onSelect} />

      {/* LOCK ACCOUNT IS REAL, AND IT DOES THE ONE REAL THING AVAILABLE.
          PropVexis cannot reach into a prop firm and disable a login — no connector
          does that, and a button that pretends to would be the worst possible lie on
          the worst possible banner. What it CAN do is stop tracking the account here:
          `is_active = false`, the same soft archive Settings › Accounts has always
          offered, which removes it from the scope switcher and every aggregate so a
          trader is not staring at a dead account's figures. The confirm says exactly
          that, in those words, so nobody clicks it believing their broker just got a
          message. It is reversible from Settings.
          Passed as null when there is no account record to act on — the banner then
          renders its message without a control rather than a control that cannot act. */}
      <AccountAlertBanner
        data={data}
        onLock={acctRecord ? lockAccount : null}
        locking={locking}
      />

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
        {/* NO REQUIREMENT MEANS NO COUNTER. A firm that sets no minimum made this
            footer read "7/0 days completed · Minimum trading days requirement" — a
            fraction over zero, which is not a progress figure at all, sitting under a
            label naming a rule the account does not have. The trader is left working
            out whether 7/0 is good. So the footer states the fact instead: there is
            nothing to complete here. The count still appears the moment a firm asks
            for one.
            `> 0` rather than truthiness so a null requirement reads the same way as a
            zero one — neither is a rule. */}
        {days.has ? (
          <>
            {/* The count is mono because it is a figure; the words are not. Rhea splits
                them so a glance lands on "7/10" rather than on the sentence around it.
                It STOPS at the requirement — see tradingDaysRead. */}
            <AccountFootFigure>{days.count}</AccountFootFigure>
            days completed
            <AccountFootRule />
            {/* The trailing line is the VERDICT once there is one. "Minimum trading days
                requirement" beside 3/3 names the rule without answering it, leaving the
                trader to do the comparison the app has already done. */}
            <span>{days.met ? 'Minimum trading days met' : 'Minimum trading days requirement'}</span>
          </>
        ) : (
          <span>No minimum trading days required</span>
        )}
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

  /* "LAST SYNCED" FROM THE SYNC JOBS, which is what the phrase actually means.
   * It used to be derived from the newest trade's close_time, because no sync feed
   * existed. That lied in both directions: a successful sync that found nothing new
   * left the line reading "never", and an account whose last trade closed on Friday
   * reported Friday as the sync time. GET /api/sync/status now answers it. */
  const [syncJobs, setSyncJobs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState(null);

  const loadSyncStatus = useCallback(() => {
    fetchSyncStatus()
      .then((d) => setSyncJobs(d?.jobs ?? []))
      .catch(() => { /* the dashboard still works without it */ });
  }, []);
  useEffect(() => { loadSyncStatus(); }, [loadSyncStatus]);

  const lastSynced = useMemo(() => {
    let newest = 0;
    for (const j of syncJobs) {
      const at = new Date(j.finished_at || 0).getTime();
      if (j.status === 'done' && at > newest) newest = at;
    }
    if (!newest) return null;
    const mins = Math.max(0, Math.round((Date.now() - newest) / 60_000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(newest).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [syncJobs]);

  /* The button reports what actually happened. A sync is asynchronous — the worker
   * picks the job up within seconds — so "Syncing…" then a plain count is honest,
   * where a spinner that resolved to nothing would look broken. A cooled-down
   * account is REPORTED, not an error: with three accounts where one synced two
   * minutes ago, the other two still go. */
  const onSync = useCallback(async () => {
    setSyncing(true);
    setSyncNote(null);
    try {
      const r = await syncNow();
      const q = r?.queued?.length ?? 0;
      const s0 = r?.skipped?.[0];
      setSyncNote(q ? `Syncing ${q} account${q === 1 ? '' : 's'}…` : (s0?.reason ?? 'Nothing to sync'));
      setTimeout(loadSyncStatus, 4000);
    } catch (e) {
      setSyncNote(e.message);
    } finally {
      setSyncing(false);
    }
  }, [loadSyncStatus]);

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

        <DashActions lastSynced={lastSynced} onSync={onSync} syncing={syncing} syncNote={syncNote} />

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

