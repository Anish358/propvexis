import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowRight, CalendarDays, ChevronDown, Clock, Flag,
  ShieldCheck, SlidersHorizontal, Sparkles, Sun,
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
  AccountCardFoot, AccountCardHead, AccountCardLink, AccountCardShell, AccountTab,
  AccountTabMore, AccountTabs, BriefAction, BriefAlert, BriefCard, BriefClock,
  BriefColumns, BriefEvent, BriefHeader, BriefNote, BriefSection, Button, Card, KpiRow,
  Tabs, EmptyState, Modal,
} from '@/components/primitives';
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
import { sevClass } from '../alerts/Notifications.jsx';
import { NetPnlCard, TradeWinCard, ProfitFactorCard, DayWinCard, AvgWinLossCard } from './KpiCards.jsx';
import { healthStatus } from '../prop/PropOS.jsx';
import AccountDetails from '../prop/AccountDetails.jsx';
import RecentTrades from '../trades/RecentTrades.jsx';
import { fetchProp, updateAccount, fetchCalendar } from '../../lib/api.js';
import { chartPalette } from '../../lib/theme.js';
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
export function DailyBanner({ notifications = [], prefs, patchBriefPrefs, setBriefSection, resetBriefPrefs }) {
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
    <BriefCard>
      <BriefHeader
        icon={<Sun aria-hidden="true" />}
        title="Today's Brief"
        date={formatBriefDate(now, prefs.timezone)}
        clock={<BriefClock icon={<Clock aria-hidden="true" />}>{formatBriefClock(now, prefs.timezone)}</BriefClock>}
        action={(
          <div className="bs-anchor">
            <BriefAction
              // Icon-only now, so the name lives here — there is no visible text left
              // to carry it.
              aria-label="Brief settings"
              title="Brief settings"
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
        /* THE FRAME'S SECOND, UNLABELLED 36px BUTTON IS NOT BUILT. It sits top-right of
           the header with no icon resolved and no behaviour implied, and the settings
           control it might duplicate is already there and labelled. A button that does
           nothing is worse than an absent one, so `aside` is left empty until someone
           says what it is for. */
      />

      {allQuiet ? (
        <BriefNote>
          Every Brief section is hidden or empty — turn one back on in Brief settings.
        </BriefNote>
      ) : (
        <BriefColumns>
          {showEvents && (
            <BriefSection label={briefEventsLabel(prefs)}>
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
            <BriefSection label="Account alerts" gap="alerts">
              {alerts.length === 0 ? (
                <BriefNote>No account alerts right now.</BriefNote>
              ) : alerts.map((n) => (
                <BriefAlert
                  key={n.id}
                  severity={n.severity}
                  icon={<AlertGlyph severity={n.severity} />}
                >
                  {n.title}
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
        // icon-only: the library has a square size for this, which is what the
        // `padding: 5px 9px` override in .dash-actions-customize used to fake.
        size="icon-sm"
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
                <stop offset="0%" stopColor={chartPalette().profit} stopOpacity={0.45} />
                <stop offset="100%" stopColor={chartPalette().profit} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chartPalette().grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke={chartPalette().axis} fontSize={11} minTickGap={40} />
            <YAxis stroke={chartPalette().axis} fontSize={11} tickFormatter={(v) => fmtValShort(v, unit)} width={52} />
            <Tooltip contentStyle={chartPalette().tip} formatter={(v) => fmtVal(v, unit)} labelStyle={{ color: chartPalette().label }} />
            <Area type="monotone" dataKey="cum" stroke={chartPalette().accent} strokeWidth={2} fill="url(#dashEquityFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
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
            onClick={() => onSelect(a.account_id)}
          >
            {/* ONE LINE, not the old stacked name-over-phase. The frame writes it as
                "#5521 · Phase 2", and a two-line tab is 48 tall against the meters'
                own rhythm — the phase is a qualifier on the name, not a second fact. */}
            {`${a.label || `Account ${a.account_id}`} · ${PHASE_LABEL[a.phase] || a.phase}`}
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
  data, candidates, selectedId, onSelect, onOpen, accounts, onChanged,
}) {
  const [targetOpen, setTargetOpen] = useState(false);
  const acctRecord = accounts.find((a) => String(a.mt5_login) === String(data.account_id));

  return (
    <AccountCardShell>
      <AccountCardHead icon={<ShieldCheck aria-hidden="true" />}>Account Health</AccountCardHead>

      <AccountHeader candidates={candidates} selectedId={selectedId} onSelect={onSelect} />

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
        {data.tradingDays.completed}/{data.tradingDays.required} minimum trading days completed
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

    /* KpiRow re-splits itself, so `--kpi-count` is gone. The row is flex with the hero
       at a 1.7 ratio (the frame's 392 : 231), which means hiding a card widens the rest
       instead of leaving a hole — the same guarantee the custom property gave, without a
       number the row has to be told. */
    kpis: () => (
      <KpiRow>
        {visibleKpis.map((id) => <React.Fragment key={id}>{kpiCard[id]()}</React.Fragment>)}
      </KpiRow>
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
