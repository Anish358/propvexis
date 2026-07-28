import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useOutletContext } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import MonthCalendar from './MonthCalendar.jsx';
import DayTradesModal from './DayTradesModal.jsx';
import Explain from './Explain.jsx';
import {
  Card, Tabs, EmptyState, Button,
} from './ui.jsx';
import DashLayoutEditor from './DashLayoutEditor.jsx';
import BriefSettingsPopover from './BriefSettingsPopover.jsx';
import {
  filterBriefEvents, briefEmptyReason, briefSectionOn, formatBriefTime,
  briefEventsLabel, defaultBriefPrefs, formatBriefDate, formatBriefClock,
} from './briefPrefs.js';
import {
  defaultDashLayout, visibleDashIds, isDashVisible, visibleSections,
  widgetSpan, GRID_COLUMNS,
} from './dashLayout.js';
import { sevClass } from './Notifications.jsx';
import { StatContext } from './DashWidgets.jsx';
import { roomStatus, healthStatus } from './PropOS.jsx';
import { fetchProp, updateAccount, fetchCalendar } from './api.js';
import { token } from './theme.js';
import {
  computeMetrics, fmtVal, fmtValShort, fmtMoney, valueField, tradeOutcome, dayKey,
} from './metrics.js';

// Chart theming from design tokens (matches Analytics.jsx's equity curve).
const CHART_PROFIT = token('--profit');
const CHART_ACCENT = token('--accent');
const CHART_GRID = token('--line');
const CHART_AXIS = token('--text-3');
const chartTip = { background: token('--surface-2'), border: `1px solid ${token('--line')}`, borderRadius: 8, color: token('--text') };

// Dashboard V1 — the fixed morning-home layout (daily banner, headline stat
// cards, calendar + recent activity, account health cards). Replaces the old
// widget-toggle dashboard: this page has one layout, not a customizable one.

const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
const PHASE_ORDER = { funded: 0, p2: 1, p1: 2 };

// ---- Section 1: daily banner --------------------------------------------


// Wall clock that re-renders on the minute. Two jobs: the time in the Brief's
// heading stays honest (a `new Date()` computed once at mount would freeze at the
// page-load time), and the time-window filter re-evaluates as events age out of
// range — so a "Next 4 Hours" list empties on its own instead of needing a reload.
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval;
    // Align the first tick to the next minute boundary so the displayed minute
    // flips when the wall clock does, not up to 59s afterwards.
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, []);
  return now;
}

// Copy for each reason the event list came back empty, so the banner explains
// what to change instead of showing a dead-end "nothing found".
const EMPTY_EVENT_COPY = {
  'no-currencies': 'No currencies selected — pick at least one in Brief settings.',
  'filtered-out': 'No events match your Brief settings for this window.',
  'no-events': 'No events on the calendar right now.',
};

function DailyBanner({ notifications = [], prefs, patchBriefPrefs, setBriefSection, resetBriefPrefs }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const alerts = notifications.filter((n) => !n.read_at || n.severity !== 'info').slice(0, 3);

  // The full upcoming feed (global, via /api/calendar) — importance, currency and
  // time-window narrowing all happen here from the user's Brief prefs, so
  // changing a setting re-filters instantly with no refetch. null while loading;
  // [] when the feed is empty or errored — the banner never blocks.
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let live = true;
    fetchCalendar()
      .then((d) => { if (live) setEvents(d.events || []); })
      .catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, []);

  // Stable between ticks, so it's safe as a memo dep — and including it is what
  // lets the window filter age events out on its own.
  const now = useMinuteClock();
  const shown = useMemo(
    () => filterBriefEvents(events || [], prefs, now).slice(0, 4),
    [events, prefs, now],
  );
  const emptyReason = events == null ? null : briefEmptyReason(events, prefs, now);

  // A section is rendered when its toggle is on AND either it has content or the
  // user hasn't asked for empty sections to be hidden.
  const showEvents = briefSectionOn(prefs, 'events') && (!prefs.hideEmpty || shown.length > 0);
  const showAlerts = briefSectionOn(prefs, 'alerts') && (!prefs.hideEmpty || alerts.length > 0);
  // With everything hidden the banner would collapse to a bare title bar, which
  // reads as broken — say so instead.
  const allQuiet = !showEvents && !showAlerts;

  return (
    <div className="dash-banner">
      <div className="dash-banner-head">
        <h3>Today's Brief</h3>
        <span className="dash-banner-date">
          {formatBriefDate(now, prefs.timezone)}
          <span className="dash-banner-clock">{formatBriefClock(now, prefs.timezone)}</span>
        </span>
        <div className="bs-anchor">
        <button
          type="button"
          className={`dash-banner-settings ${settingsOpen ? 'is-open' : ''}`}
          title="Brief settings"
          aria-label="Brief settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <BriefSettingsPopover
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          prefs={prefs}
          patchBriefPrefs={patchBriefPrefs}
          setBriefSection={setBriefSection}
          resetBriefPrefs={resetBriefPrefs}
        />
        </div>
      </div>

      {showEvents && (
      <div className="dash-banner-news">
        <div className="dash-banner-label">{briefEventsLabel(prefs)}</div>
        {events == null ? (
          <div className="dash-banner-empty muted">Loading economic calendar…</div>
        ) : shown.length === 0 ? (
          <div className="dash-banner-empty muted">{EMPTY_EVENT_COPY[emptyReason] || EMPTY_EVENT_COPY['no-events']}</div>
        ) : (
          <ul className="dash-events">
            {shown.map((e, i) => (
              <li key={`${e.date}-${e.title}-${i}`} className="dash-event">
                <span className="dash-event-ccy">{e.country}</span>
                <span className="dash-event-title" title={e.title}>{e.title}</span>
                <span className="dash-event-time">{formatBriefTime(e.date, prefs.timezone, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {showAlerts && (
        <div className="dash-banner-alerts">
          {alerts.length === 0 ? (
            <span className="muted">No account alerts right now.</span>
          ) : alerts.map((n) => (
            <span key={n.id} className={`dash-banner-alert ${sevClass(n.severity)}`}>{n.title}</span>
          ))}
        </div>
      )}

      {allQuiet && (
        <div className="dash-banner-empty muted">
          Every Brief section is hidden or empty — turn one back on in Brief settings.
        </div>
      )}
    </div>
  );
}

// Dashboard-level actions, sitting in the reserved strip between Today's Brief
// and the KPI row. Deliberately chrome-free — no panel, border or divider — so
// it reads as two controls floating in whitespace rather than a third section.
// Sync Trades is still a placeholder (the timestamp is static copy); Customize
// opens the layout panel.
function DashActions({ onCustomize }) {
  return (
    <div className="dash-actions">
      <div className="dash-actions-left">
        <Button variant="secondary" size="sm" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M21 21v-5h-5" />
          </svg>
          Sync Trades
        </Button>
        <span className="dash-actions-status">Last synced: 2 min ago</span>
      </div>

      <Button
        variant="secondary"
        size="sm"
        type="button"
        className="dash-actions-customize"
        title="Customize layout"
        aria-label="Customize layout"
        onClick={onCustomize}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
          <path d="M14 2v4M8 10v4M16 18v4" />
        </svg>
      </Button>
    </div>
  );
}

// ---- Section 2: stat cards ------------------------------------------------
// Net P&L, Trade Win %, Profit Factor, Day Win %, Avg Win/Loss — each paired
// with a small gauge/ring/split-bar so the row reads at a glance, not just as
// numbers (TradeZella-style headline cards).

function NetPnlCard({ m, unit }) {
  const today = m.days.find((d) => d.key === dayKey(new Date()));
  const todayPnl = today ? today.pnl : 0;
  return (
    <Card className="dash-stat dash-stat--refined">
      <div className="jo-kpi-label">
        Net P&L
        <Explain size={13} nudgeY={-1} openUp>Total realized P&amp;L across all closed trades in the current filter.</Explain>
        <span className="dash-stat-count">{m.tradeCount} Trade{m.tradeCount === 1 ? '' : 's'}</span>
      </div>
      <div className={`jo-kpi-value ${signTone(m.net)}`}>{fmtVal(m.net, unit)}</div>
      <StatContext label="Today" value={fmtVal(todayPnl, unit)} tone={signTone(todayPnl)} />
    </Card>
  );
}

function TradeWinCard({ m }) {
  return (
    <Card className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        Trade win %
        <Explain size={13} nudgeY={-1} openUp>Share of decided trades (wins + losses, excluding breakeven) that closed as a win.</Explain>
      </div>
      <div className="jo-kpi-value">{m.winRate.toFixed(2)}%</div>
    </Card>
  );
}

function ProfitFactorCard({ m }) {
  return (
    <Card className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        Profit factor
        <Explain size={13} nudgeY={-1} openUp>Gross profit divided by gross loss. Above 1 means the account is net profitable.</Explain>
      </div>
      <div className="jo-kpi-value">{m.profitFactor === 999 ? '∞' : m.profitFactor.toFixed(2)}</div>
    </Card>
  );
}

function DayWinCard({ days }) {
  return (
    <Card className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        Day win %
        <Explain size={13} nudgeY={-1} openUp>Share of trading days that closed net positive.</Explain>
      </div>
      <div className="jo-kpi-value">{days.rate.toFixed(2)}%</div>
    </Card>
  );
}

function AvgWinLossCard({ m }) {
  return (
    <Card className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        Avg win/loss trade
        <Explain size={13} nudgeY={-1} openUp>Average size of a winning trade divided by the average size of a losing trade.</Explain>
      </div>
      <div className="jo-kpi-value">{m.avgWinLoss === Infinity ? '∞' : m.avgWinLoss.toFixed(2)}</div>
    </Card>
  );
}

// ---- Section 3 left: recent trades / open positions ----------------------

function RecentTrades({ trades, unit, beRounding }) {
  const field = valueField(unit);
  const recent = useMemo(
    () => trades
      .filter((t) => t[field] != null && t.close_time)
      .sort((a, b) => new Date(b.close_time) - new Date(a.close_time))
      .slice(0, 6),
    [trades, field],
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
    <Card className="dash-activity card-md">
      <Tabs
        tabs={[{ value: 'recent', label: 'Recent Trades' }, { value: 'open', label: 'Open Positions' }]}
        value={tab}
        onChange={setTab}
      />
      <div className="dash-activity-body">
        {tab === 'recent' ? <RecentTrades trades={trades} unit={unit} beRounding={beRounding} /> : <OpenPositions />}
      </div>
    </Card>
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

  return (
    <Card className="dash-equity card-md">
      <div className="dash-equity-head">
        <h3>Daily net cumulative {unit === 'USD' ? 'P&L' : 'R'}</h3>
        <Explain>Running total of each day's closed P&amp;L, in order, across all trades.</Explain>
      </div>
      {data.length === 0 ? (
        <EmptyState title="No closed trades yet" description="Your cumulative P&L will chart here once you have closed trades." />
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="dashEquityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_PROFIT} stopOpacity={0.45} />
                <stop offset="100%" stopColor={CHART_PROFIT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke={CHART_AXIS} fontSize={11} minTickGap={40} />
            <YAxis stroke={CHART_AXIS} fontSize={11} tickFormatter={(v) => fmtValShort(v, unit)} width={52} />
            <Tooltip contentStyle={chartTip} formatter={(v) => fmtVal(v, unit)} labelStyle={{ color: token('--text-2') }} />
            <Area type="monotone" dataKey="cum" stroke={CHART_ACCENT} strokeWidth={2} fill="url(#dashEquityFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ---- Section 3 right: account health cards --------------------------------

const PHASE_LABEL = { funded: 'Funded', p2: 'Phase 2', p1: 'Phase 1' };

// A single "$used / $limit" row with a fill bar — used/limit framing (bar fills
// UP as risk grows) rather than a room-remaining framing, so a nearly-full bar
// reads as a warning at a glance.
function UsageMeter({
  label, used, limit, pct, tone, sub,
}) {
  const money = (n) => (n == null ? '—' : fmtMoney(n));
  return (
    <div className={`dash-usage prop-${tone}`}>
      <div className="dash-usage-head">
        <span className="dash-usage-label">{label}</span>
        <span className="dash-usage-val">{money(used)} <span className="muted">/ {money(limit)}</span></span>
      </div>
      <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: `${Math.round((pct || 0) * 100)}%` }} /></div>
      {sub && <div className="dash-usage-sub">{sub}</div>}
    </div>
  );
}

// Attention icon shown next to an account's name — ONLY for warn/bad. A
// healthy account gets no icon at all (zero visual emphasis is the point);
// warning gets a triangle, critical gets a fuller alert-circle so severity
// reads as a shape difference too, not just color.
function AccountAlertIcon({ status }) {
  if (status === 'good') return null;
  const label = status === 'warn' ? 'Warning' : 'Critical';
  return (
    <span className={`dash-acct-tab-alert dash-acct-tab-alert--${status}`} title={label} aria-label={label}>
      {status === 'warn' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )}
    </span>
  );
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
    <div className="dash-acct-header">
      <div className="dash-acct-tabs">
        {visible.map((a) => {
          const st = healthStatus(a.health.score, a.breach.breached);
          const active = String(a.account_id) === String(selectedId);
          return (
            <div key={a.account_id} className="dash-acct-tab-cell">
              <button
                type="button"
                className={`dash-acct-tab ${active ? 'is-active' : ''}`}
                onClick={() => onSelect(a.account_id)}
              >
                <span className={`dash-acct-tab-dot dash-acct-tab-dot--${st}`} />
                <span className="dash-acct-tab-text">
                  <span className="dash-acct-tab-name-row">
                    <span className="dash-acct-tab-name">{a.label || `Account ${a.account_id}`}</span>
                    <AccountAlertIcon status={st} />
                  </span>
                  <span className="dash-acct-tab-type">{PHASE_LABEL[a.phase] || a.phase}</span>
                </span>
              </button>
            </div>
          );
        })}
        {overflow.length > 0 && (
          <div className="dash-acct-tab-cell dash-acct-more" ref={ref}>
            <button type="button" className="dash-acct-more-btn" onClick={() => setOpen((o) => !o)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
              +{overflow.length} Account{overflow.length > 1 ? 's' : ''}
            </button>
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
                    {a.phase && <span className="dash-acct-tab-type muted">{PHASE_LABEL[a.phase] || a.phase}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Lets a trader set a manual profit target on a funded account (which carries
// no target by default — see profitTargetState in src/prop.js). Writes
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

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal target-modal" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>,
    document.body,
  );
}

// The dashboard's single primary account card — spans the full width, with an
// account header (tab row) so switching which account you're looking at
// doesn't require leaving the page.
function AccountCard({
  data, candidates, selectedId, onSelect, onOpen, accounts, onChanged,
}) {
  const [targetOpen, setTargetOpen] = useState(false);
  const maxSt = roomStatus(data.maxDd?.fracRemaining, data.maxDd?.breached);
  const daySt = roomStatus(data.dailyDd?.fracRemaining, data.dailyDd?.breached);
  const money = (n) => (n == null ? '—' : fmtMoney(n));
  const pct1 = (f) => `${((f || 0) * 100).toFixed(1)}%`;

  const maxUsed = data.maxDd ? data.maxDd.limit - data.maxDd.roomLeft : null;
  const maxPct = data.maxDd?.limit ? maxUsed / data.maxDd.limit : 0;
  const dayPct = data.dailyDd?.limit ? data.dailyDd.usedToday / data.dailyDd.limit : 0;
  const fundedProfit = data.currentEquity != null && data.startBalance != null ? data.currentEquity - data.startBalance : null;
  const acctRecord = accounts.find((a) => String(a.mt5_login) === String(data.account_id));

  return (
    <Card className="dash-acct-card dash-acct-card-wide">
      <AccountHeader candidates={candidates} selectedId={selectedId} onSelect={onSelect} />

      <div className="dash-acct-usages dash-acct-usages-grid">
        <UsageMeter
          label="Daily drawdown"
          used={data.dailyDd?.usedToday}
          limit={data.dailyDd?.limit}
          pct={dayPct}
          tone={daySt}
          sub={`${pct1(dayPct)} used · ${money(data.dailyDd?.roomLeft)} remaining`}
        />
        <UsageMeter
          label="Max drawdown"
          used={maxUsed}
          limit={data.maxDd?.limit}
          pct={maxPct}
          tone={maxSt}
          sub={`${pct1(maxPct)} used · ${money(data.maxDd?.roomLeft)} remaining`}
        />
        {data.profitTarget ? (
          <UsageMeter
            label={data.phase === 'funded' ? 'Payout target' : 'Profit target'}
            used={data.profitTarget.current}
            limit={data.profitTarget.target}
            pct={data.profitTarget.pctToTarget}
            tone={data.phase === 'funded' ? 'payout' : 'target'}
            sub={(
              <>
                <span>
                  {data.profitTarget.reached
                    ? 'Target reached'
                    : `${pct1(data.profitTarget.pctToTarget)} of target · ${money(data.profitTarget.target - data.profitTarget.current)} to go`}
                </span>
                {data.phase === 'funded' && acctRecord && (
                  <button
                    type="button"
                    className="dash-usage-settarget dash-usage-settarget--edit"
                    onClick={() => setTargetOpen(true)}
                  >
                    Edit payout target
                  </button>
                )}
              </>
            )}
          />
        ) : data.phase === 'funded' ? (
          <div className="dash-usage prop-na">
            <div className="dash-usage-head">
              <span className="dash-usage-label">Payout</span>
              <span className="dash-usage-val">{money(fundedProfit)}</span>
            </div>
            <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: '0%' }} /></div>
            <div className="dash-usage-sub">
              No payout target set for this funded account.{' '}
              {acctRecord && (
                <button type="button" className="dash-usage-settarget" onClick={() => setTargetOpen(true)}>Set payout target</button>
              )}
            </div>
          </div>
        ) : <div className="dash-usage dash-usage-empty" />}
      </div>

      <div className="dash-acct-foot">
        <span className="dash-acct-days">{data.tradingDays.completed}/{data.tradingDays.required} days completed</span>
        <button type="button" className="dash-acct-view" onClick={onOpen}>View account →</button>
      </div>

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
    </Card>
  );
}

// ---- page ------------------------------------------------------------------

export default function Dashboard() {
  const {
    trades = [], accounts = [], accountId = 'all', setAccountId,
    unit = 'R', notifications = [], pinnedAccounts = [], setPinnedAccounts, tradeSettings = {},
    dashLayout, setDashVisible, moveDashWidget, resetDashLayout,
    briefPrefs, patchBriefPrefs, setBriefSection, resetBriefPrefs,
  } = useOutletContext();
  const layout = dashLayout || defaultDashLayout();
  const brief = briefPrefs || defaultBriefPrefs();
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const beRounding = !!tradeSettings.beRounding;
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
  // itself makes; god scope returns one item per account, single scope one item.
  const [propData, setPropData] = useState(null);
  function loadProp() {
    fetchProp(accountId).then((d) => setPropData(d)).catch(() => {});
  }
  useEffect(() => { setPropData(null); loadProp(); /* eslint-disable-next-line */ }, [accountId]);

  const candidates = useMemo(() => {
    const list = (propData?.god ? propData.accounts : propData ? [propData] : []).filter((a) => a.challengeId);
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

  // ---- layout-driven render ----
  // Every customizable widget is a thunk keyed by its layout id, so the page's
  // order is literally the order of the arrays in `layout`, and there is a single
  // place that knows how to build each widget. The layout editor renders its
  // wireframe from those same arrays, which is what keeps the two in step.
  const kpiCard = {
    netPnl: () => <NetPnlCard m={m} unit={unit} />,
    tradeWin: () => <TradeWinCard m={m} />,
    profitFactor: () => <ProfitFactorCard m={m} />,
    dayWin: () => <DayWinCard days={dayStats} />,
    avgWinLoss: () => <AvgWinLossCard m={m} unit={unit} />,
  };

  // Main-grid widgets. Each is placed by CSS Grid's dense auto-flow from its
  // ordinal position + its catalogue size — no coordinates anywhere.
  const gridWidget = {
    account: () => (!selectedAccount ? (
      <Card className="dash-acct-card dash-acct-card-wide">
        <EmptyState
          title="No prop accounts yet"
          description="Add a prop account with challenge rules to see drawdown and profit-target tracking here."
        />
      </Card>
    ) : (
      <AccountCard
        data={selectedAccount}
        candidates={candidates}
        selectedId={selectedAccount.account_id}
        onSelect={(id) => setPinnedAccounts([id])}
        onOpen={() => setAccountId(String(selectedAccount.account_id))}
        accounts={accounts}
        onChanged={loadProp}
      />
    )),
    calendar: () => (
      <div className="panel dash-cal-panel card-lg">
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
      </div>
    ),
    activity: () => <ActivityCard trades={trades} unit={unit} beRounding={beRounding} />,
    cumulative: () => <CumulativePnlCard days={m.days} unit={unit} />,
  };

  const visibleKpis = visibleDashIds(layout, 'kpis');
  const visibleWidgets = visibleDashIds(layout, 'main');

  const sectionNode = {
    brief: () => (
      <DailyBanner
        notifications={notifications}
        prefs={brief}
        patchBriefPrefs={patchBriefPrefs}
        setBriefSection={setBriefSection}
        resetBriefPrefs={resetBriefPrefs}
      />
    ),

    // --kpi-count drives the column count, so hiding a card re-splits the row
    // evenly instead of leaving a hole where it used to be.
    kpis: () => (
      <div className="jo-kpis dash-stats" style={{ '--kpi-count': visibleKpis.length }}>
        {visibleKpis.map((id) => <React.Fragment key={id}>{kpiCard[id]()}</React.Fragment>)}
      </div>
    ),

    // The content grid. GRID_COLUMNS wide with dense packing, and row height is
    // the existing --dash-card-h-md card unit — so a `large` (2x2) calendar comes
    // out at exactly the height the old fixed card-lg class produced.
    main: () => (
      <div className="dash-grid" style={{ '--dash-grid-cols': GRID_COLUMNS }}>
        {visibleWidgets.map((id) => {
          const { cols, rows } = widgetSpan(id);
          return (
            <div
              key={id}
              className="dash-grid-cell"
              style={{ gridColumn: `span ${cols}`, gridRow: `span ${rows}` }}
            >
              {gridWidget[id]()}
            </div>
          );
        })}
      </div>
    ),
  };

  const sections = visibleSections(layout);
  // The action strip is fixed chrome, not a customizable widget — it rides
  // directly under Today's Brief (preserving the designed arrangement even if
  // the Brief is dragged elsewhere). With the Brief hidden it goes to the top,
  // so the Customize button is never unreachable.
  const stripAfter = isDashVisible(layout, 'brief') ? 'brief' : null;

  return (
    <div className="page">
      <DayTradesModal
        dayKeyStr={selectedDay}
        trades={trades}
        unit={unit}
        beRounding={beRounding}
        onClose={() => setSelectedDay(null)}
      />

      <DashLayoutEditor
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        layout={layout}
        setDashVisible={setDashVisible}
        moveDashWidget={moveDashWidget}
        resetDashLayout={resetDashLayout}
      />

      <div className="page-body dash-page-body">
        {stripAfter === null && <DashActions onCustomize={() => setCustomizeOpen(true)} />}
        {sections.map((id) => (
          <React.Fragment key={id}>
            {sectionNode[id]()}
            {stripAfter === id && <DashActions onCustomize={() => setCustomizeOpen(true)} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
