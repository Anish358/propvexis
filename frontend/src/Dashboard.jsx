import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useOutletContext } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import PageHeader from './PageHeader.jsx';
import PayoutsModal from './PayoutsModal.jsx';
import MonthCalendar from './MonthCalendar.jsx';
import DayTradesModal from './DayTradesModal.jsx';
import Explain from './Explain.jsx';
import {
  Card, Badge, Tabs, EmptyState,
} from './ui.jsx';
import { sevClass } from './Notifications.jsx';
import { StatContext } from './DashWidgets.jsx';
import { roomStatus, healthStatus } from './PropOS.jsx';
import { fetchProp, updateAccount, fetchCalendar } from './api.js';
import { token } from './theme.js';
import {
  computeMetrics, computeProp, fmtVal, fmtValShort, fmtMoney, valueField, tradeOutcome, dayKey,
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

// Event time relative to now: "2:30 PM" if today, else "Mon 2:30 PM". Rendered
// in the viewer's local timezone from the feed's tz-aware ISO timestamp.
function fmtEventTime(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}

function DailyBanner({ notifications = [] }) {
  const alerts = notifications.filter((n) => !n.read_at || n.severity !== 'info').slice(0, 3);

  // Upcoming high-impact macro events (global feed via /api/calendar). null while
  // loading; [] when the feed is empty or errored — the banner never blocks.
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let live = true;
    fetchCalendar()
      .then((d) => { if (live) setEvents(d.events || []); })
      .catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, []);

  return (
    <div className="dash-banner">
      <div className="dash-banner-news">
        <div className="dash-banner-label">High-impact events</div>
        {events == null ? (
          <div className="dash-banner-empty muted">Loading economic calendar…</div>
        ) : events.length === 0 ? (
          <div className="dash-banner-empty muted">No high-impact events on the calendar.</div>
        ) : (
          <ul className="dash-events">
            {events.slice(0, 4).map((e, i) => (
              <li key={`${e.date}-${e.title}-${i}`} className="dash-event">
                <span className="dash-event-ccy">{e.country}</span>
                <span className="dash-event-title" title={e.title}>{e.title}</span>
                <span className="dash-event-time">{fmtEventTime(e.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="dash-banner-alerts">
        {alerts.length === 0 ? (
          <span className="muted">No account alerts right now.</span>
        ) : alerts.map((n) => (
          <span key={n.id} className={`dash-banner-alert ${sevClass(n.severity)}`}>{n.title}</span>
        ))}
      </div>
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
    <div className="jo-recent">
      {recent.map((t) => {
        const out = tradeOutcome(t, unit, beRounding);
        const val = Number(t[field]);
        return (
          <div className="jo-trade" key={t.id}>
            <span className="jo-trade-sym">{t.symbol_base || t.symbol}</span>
            <Badge tone="neutral">{(t.direction || '').toUpperCase() || '—'}</Badge>
            <span className={`jo-trade-val ${out === 'win' ? 'pos' : out === 'loss' ? 'neg' : ''}`}>{fmtVal(val, unit)}</span>
            <span className="jo-trade-date">{fmtDate(t.close_time)}</span>
          </div>
        );
      })}
    </div>
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
    <Card className="dash-activity">
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
    <Card className="dash-equity">
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
    trades = [], account, accounts = [], payouts = [], reloadPayouts, accountId = 'all', setAccountId,
    unit = 'R', notifications = [], pinnedAccounts = [], setPinnedAccounts, tradeSettings = {},
  } = useOutletContext();

  const beRounding = !!tradeSettings.beRounding;
  const m = useMemo(() => computeMetrics(trades, unit, beRounding), [trades, unit, beRounding]);
  const p = useMemo(() => computeProp(trades, account, payouts), [trades, account, payouts]);

  const [payoutsOpen, setPayoutsOpen] = useState(false);
  const fundedAccounts = useMemo(() => {
    const funded = accounts.filter((a) => a.account_type === 'funded');
    return accountId === 'all' ? funded : funded.filter((a) => String(a.mt5_login) === String(accountId));
  }, [accounts, accountId]);
  const showPayoutTracker = fundedAccounts.length > 0;
  const payoutTotal = p.payout?.trader ?? 0;

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

  return (
    <div className="page">
      <PageHeader
        right={showPayoutTracker && (
          <button className="ph-payout" onClick={() => setPayoutsOpen(true)} title="View & record payouts">
            <span className="ph-payout-label">Total payout</span>
            <span className="ph-payout-val">{fmtMoney(payoutTotal)}</span>
          </button>
        )}
      />

      {payoutsOpen && (
        <PayoutsModal
          payouts={payouts}
          fundedAccounts={fundedAccounts}
          defaultLogin={accountId === 'all' ? undefined : accountId}
          onClose={() => setPayoutsOpen(false)}
          onChanged={() => reloadPayouts?.()}
        />
      )}

      <DayTradesModal
        dayKeyStr={selectedDay}
        trades={trades}
        unit={unit}
        beRounding={beRounding}
        onClose={() => setSelectedDay(null)}
      />

      <div className="page-body dash-page-body">
        <DailyBanner notifications={notifications} />

        <div className="jo-kpis dash-stats">
          <NetPnlCard m={m} unit={unit} />
          <TradeWinCard m={m} />
          <ProfitFactorCard m={m} />
          <DayWinCard days={dayStats} />
          <AvgWinLossCard m={m} unit={unit} />
        </div>

        {!selectedAccount ? (
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
        )}

        <div className="dash-main">
          <div className="dash-col-left">
            <div className="panel dash-cal-panel">
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
          </div>

          <div className="dash-col-right">
            <ActivityCard trades={trades} unit={unit} beRounding={beRounding} />
            <CumulativePnlCard days={m.days} unit={unit} />
          </div>
        </div>
      </div>
    </div>
  );
}
