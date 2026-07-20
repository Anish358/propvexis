import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from 'recharts';
import PageHeader from './PageHeader.jsx';
import { LoadingBlock } from './ui.jsx';
import Explain from './Explain.jsx';
import { fetchProp, fetchPropFinance, fetchPropInsights, advanceChallenge, updateAccount } from './api.js';
import { fmtMoney, fmtMoneyShort } from './metrics.js';
import { token } from './theme.js';
import FeesModal from './FeesModal.jsx';

// Chart theming from design tokens (matches the rest of the app).
const C_EARNED = token('--profit');
const C_SPENT = token('--loss');
const C_NET = token('--accent');
const C_GRID = token('--line');
const C_AXIS = token('--text-3');
const C_REF = token('--line-strong');
const C_LABEL = token('--text-2');
const propTip = { background: token('--surface-2'), border: `1px solid ${token('--line')}`, borderRadius: 8, color: token('--text') };

// Cumulative earned / spent / net over time (data from finance.roiProgression).
// Line palette matches the app's equity-curve charts (Analytics/Reports).
function RoiProgressionChart({ series }) {
  if (!series || series.length < 2) return null;
  return (
    <div className="prop-roi">
      <h4 className="prop-roi-title">ROI progression</h4>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={C_GRID} />
          <XAxis dataKey="date" stroke={C_AXIS} fontSize={11} tickFormatter={(d) => d.slice(5)} />
          <YAxis stroke={C_AXIS} fontSize={11} tickFormatter={(v) => fmtMoneyShort(v)} />
          <Tooltip
            contentStyle={propTip}
            formatter={(v, n) => [fmtMoney(v), n]}
            labelStyle={{ color: C_LABEL }}
          />
          <ReferenceLine y={0} stroke={C_REF} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="earned" name="Earned" stroke={C_EARNED} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="spent" name="Spent" stroke={C_SPENT} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="net" name="Net" stroke={C_NET} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Finance band (Prop OS Overview): spend vs earnings → net + ROI, with a by-firm
// breakdown. Data from GET /api/prop/finance (src/finance.js).
function FinKpi({ label, value, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone || ''}`}>{value}</div>
    </div>
  );
}
const roiText = (r) => (r == null ? '—' : `${r}%`);
const roiTone = (r) => (r == null ? '' : r >= 0 ? 'win' : 'loss');

function FinanceBand({ fin, onLogFee }) {
  if (!fin) return null;
  return (
    <div className="panel prop-finance">
      <div className="prop-finance-head">
        <h3>Finance</h3>
        <button type="button" className="btn" onClick={onLogFee}>Log fee</button>
      </div>
      <div className="kpi-row">
        <FinKpi label="Total spent" value={fmtMoney(fin.spent)} tone="loss" />
        <FinKpi label="Total earned" value={fmtMoney(fin.earned)} tone="win" />
        <FinKpi label="Net" value={fmtMoney(fin.net)} tone={fin.net >= 0 ? 'win' : 'loss'} />
        <FinKpi label="ROI" value={roiText(fin.roiPct)} tone={roiTone(fin.roiPct)} />
      </div>
      {fin.byFirm.length > 1 && (
        <div className="bd prop-finance-firms">
          <table>
            <thead><tr><th>Firm</th><th>Spent</th><th>Earned</th><th>Net</th><th>ROI</th></tr></thead>
            <tbody>
              {fin.byFirm.map((f) => (
                <tr key={f.firmId || 'other'}>
                  <td>{f.firmName}</td>
                  <td className="num">{fmtMoney(f.spent)}</td>
                  <td className="num">{fmtMoney(f.earned)}</td>
                  <td className="num" style={{ color: f.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(f.net)}</td>
                  <td className="num">{roiText(f.roiPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RoiProgressionChart series={fin.progression} />
    </div>
  );
}

// Passing & breach insights — pass rates + breach patterns across firm/size/phase.
// Data from GET /api/prop/insights (src/insights.js).
const pct = (v) => (v == null ? '—' : `${v}%`);

function InsightDim({ title, rows }) {
  const shown = rows.filter((r) => r.attempts > 0 || r.active > 0);
  if (shown.length <= 1) return null; // nothing to compare
  return (
    <div className="bd prop-insight-dim">
      <h4>{title}</h4>
      <table>
        <thead><tr><th></th><th>Passed</th><th>Breached</th><th>Active</th><th>Pass rate</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{r.passed}</td>
              <td className="num">{r.breached}</td>
              <td className="num">{r.active}</td>
              <td className="num">{pct(r.passRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightsBand({ ins }) {
  if (!ins) return null;
  const hasHistory = ins.attempts > 0;
  return (
    <div className="panel prop-insights">
      <h3>Passing &amp; breach insights</h3>
      {!hasHistory ? (
        <p className="muted prop-insights-empty">
          No completed challenge attempts yet. As you mark phases passed or reset breached
          challenges, pass rates and breach patterns build up here.
        </p>
      ) : (
        <>
          <div className="kpi-row">
            <FinKpi label="Pass rate" value={pct(ins.passRate)} tone={ins.passRate == null ? '' : ins.passRate >= 50 ? 'win' : 'loss'} />
            <FinKpi label="Passed" value={ins.passed} tone="win" />
            <FinKpi label="Breached" value={ins.breached} tone="loss" />
            <FinKpi label="Active" value={ins.active} />
          </div>
          {ins.breachReasons.length > 0 && (
            <div className="prop-insight-reasons">
              <span className="muted">Breaches by reason:</span>
              {ins.breachReasons.map((r) => (
                <span key={r.reason} className="prop-reason-chip">{REASON_LABEL[r.reason] || r.reason} · {r.count}</span>
              ))}
            </div>
          )}
          <div className="bd-grid prop-insight-grid">
            <InsightDim title="By firm" rows={ins.byFirm} />
            <InsightDim title="By account size" rows={ins.bySize} />
            <InsightDim title="By phase" rows={ins.byPhase} />
          </div>
        </>
      )}
    </div>
  );
}
const REASON_LABEL = { max_dd: 'Max drawdown', daily_dd: 'Daily drawdown', unspecified: 'Unspecified' };

// Prop OS — how each prop account is tracking against the firm's rules. Single
// account = full detail; god view = a portfolio card per account. All values are
// account currency ($). Data comes server-computed from GET /api/prop (src/prop.js).

const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', funded: 'Funded' };
const clamp01 = (x) => (x == null ? 0 : x < 0 ? 0 : x > 1 ? 1 : x);

// Drawdown headroom → status. Colour is ALWAYS paired with this word + the figures
// (status must never be colour-alone — green/red is the classic CVD confusion).
function roomStatus(frac, breached) {
  if (breached) return 'bad';
  if (frac == null) return 'na';
  if (frac >= 0.5) return 'good';
  if (frac >= 0.25) return 'warn';
  return 'bad';
}
const STATUS_WORD = { good: 'Healthy', warn: 'Caution', bad: 'At risk', na: '—' };

function healthStatus(score, breached) {
  if (breached) return 'bad';
  if (score >= 67) return 'good';
  if (score >= 34) return 'warn';
  return 'bad';
}

function PhaseBadge({ phase, status }) {
  const cls = status === 'breached' ? 'bad' : status === 'passed' ? 'good' : 'active';
  return <span className={`prop-phase ${cls}`}>{PHASE_LABEL[phase] || phase}{status !== 'active' ? ` · ${status}` : ''}</span>;
}

// Circular health gauge — one hero number, colour by status, ring fills to score.
function HealthGauge({ score, breached }) {
  const st = healthStatus(score, breached);
  const shown = breached ? 0 : score;
  const deg = Math.round((shown / 100) * 360);
  return (
    <div className={`prop-gauge ${st}`}>
      <div className="prop-gauge-ring" style={{ background: `conic-gradient(var(--g-fill) ${deg}deg, var(--g-track) 0deg)` }}>
        <div className="prop-gauge-center">
          <div className="prop-gauge-score">{shown}</div>
          <div className="prop-gauge-cap">HEALTH</div>
        </div>
      </div>
    </div>
  );
}

// Linear headroom gauge. Fill = fraction of the allowance still intact (full green
// = safe, shrinking amber/red = approaching the limit).
function Meter({ label, frac, status, primary, secondary, explain }) {
  const pct = Math.round(clamp01(frac) * 100);
  return (
    <div className={`prop-meter ${status}`}>
      <div className="prop-meter-head">
        <span className="prop-meter-label">{label}{explain && <Explain>{explain}</Explain>}</span>
        <span className="prop-meter-word">{STATUS_WORD[status]}</span>
      </div>
      <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: `${pct}%` }} /></div>
      <div className="prop-meter-foot">
        <span>{primary}</span>
        <span className="muted">{secondary}</span>
      </div>
    </div>
  );
}

function TradingDays({ completed, required, met }) {
  const n = Math.max(required, completed, 1);
  return (
    <div className="prop-card">
      <div className="prop-card-head">
        <span>Trading days<Explain>Distinct days with at least one trade in the current cycle. For funded accounts the count resets after every payout.</Explain></span>
        <span className={`prop-meter-word ${met ? 'good' : 'warn'}`}>{met ? 'Met' : `${required - completed} to go`}</span>
      </div>
      <div className="prop-days">
        {Array.from({ length: n }, (_, i) => <span key={i} className={`prop-day ${i < completed ? 'done' : ''}`} />)}
      </div>
      <div className="prop-card-foot muted">{completed} of {required} required</div>
    </div>
  );
}

// One account's full state (single-account view, or reused inside god cards small).
function AccountDetail({ data, editable, onChanged }) {
  const { maxDd, dailyDd, profitTarget, tradingDays, health, breach } = data;
  const ccy = data.currency || 'USD';
  const money = (n) => (n == null ? '—' : fmtMoney(n));

  if (!maxDd) {
    return <div className="prop-empty">No drawdown rules for this account. Set a starting balance and limits to track it as a prop account.</div>;
  }

  const maxSt = roomStatus(maxDd.fracRemaining, maxDd.breached);
  const daySt = roomStatus(dailyDd.fracRemaining, dailyDd.breached);

  return (
    <>
      {breach.breached && (
        <div className="prop-breach">
          ⚠ {breach.reason === 'max_dd' ? 'Max drawdown breached' : 'Daily drawdown breached'} — this challenge is failed.
        </div>
      )}

      <div className="prop-grid">
        <div className="prop-card prop-hero">
          <HealthGauge score={health.score} breached={breach.breached} />
          <div className="prop-hero-meta">
            <div className="prop-hero-equity">{money(data.currentEquity)}</div>
            <div className="muted">equity · start {money(data.startBalance)}</div>
            <div className="prop-components">
              {health.components.filter((c) => c.key !== 'breached').map((c) => (
                <div key={c.key} className="prop-comp">
                  <span className="prop-comp-label muted">{c.key === 'maxDd' ? 'Max DD' : c.key === 'dailyDd' ? 'Daily DD' : 'Progress'}</span>
                  <div className="prop-comp-track"><div className="prop-comp-fill" style={{ width: `${Math.round(clamp01(c.value) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Meter
          label={<>Max drawdown room</>}
          frac={maxDd.fracRemaining}
          status={maxSt}
          primary={`${money(maxDd.roomLeft)} left`}
          secondary={`floor ${money(maxDd.floor)} · ${maxDd.type}`}
          explain={`You fail if equity falls to the ${maxDd.type} floor (${money(maxDd.floor)}). Limit is ${money(maxDd.limit)}.`}
        />

        <Meter
          label={<>Daily drawdown room</>}
          frac={dailyDd.fracRemaining}
          status={daySt}
          primary={`${money(dailyDd.roomLeft)} left today`}
          secondary={`used ${money(dailyDd.usedToday)} of ${money(dailyDd.limit)}`}
          explain={`Most you can lose in one day, measured from the day's opening equity. Resets each day.`}
        />

        <TradingDays completed={tradingDays.completed} required={tradingDays.required} met={tradingDays.met} />

        {profitTarget && (
          <Meter
            label={<>Profit target</>}
            frac={profitTarget.pctToTarget}
            status={profitTarget.reached ? 'good' : 'warn'}
            primary={`${money(profitTarget.current)} of ${money(profitTarget.target)}`}
            secondary={profitTarget.reached ? 'target reached' : `${Math.round(clamp01(profitTarget.pctToTarget) * 100)}% there`}
            explain="Profit needed to pass this evaluation phase. Funded accounts have no target."
          />
        )}
      </div>

      {editable && <ChallengeControls data={data} onChanged={onChanged} />}
    </>
  );
}

// Rule editing + phase advance for the single-account view.
function ChallengeControls({ data, onChanged }) {
  const { accounts } = useOutletContext();
  const acct = accounts.find((a) => String(a.mt5_login) === String(data.account_id));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({
    start_balance: data.startBalance ?? '',
    daily_dd_pct: data.dailyDd?.limit && data.startBalance ? +(100 * data.dailyDd.limit / data.startBalance).toFixed(2) : '',
    max_dd_pct: data.maxDd?.limit && data.startBalance ? +(100 * data.maxDd.limit / data.startBalance).toFixed(2) : '',
    dd_type: data.ddType || 'static',
    min_trading_days: data.tradingDays?.required ?? 0,
  });

  if (!acct) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true); setErr(null);
    try {
      await updateAccount(acct.id, {
        start_balance: form.start_balance === '' ? null : Number(form.start_balance),
        daily_dd_pct: Number(form.daily_dd_pct),
        max_dd_pct: Number(form.max_dd_pct),
        dd_type: form.dd_type,
        min_trading_days: Number(form.min_trading_days),
      });
      setOpen(false);
      onChanged();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function advance(toPhase, mark) {
    setBusy(true); setErr(null);
    // On a breach reset, persist the engine's detected reason (max_dd / daily_dd)
    // so breach insights can break down "why" — the live state knows it even
    // though the row only records it now.
    const breach_reason = mark === 'breached' ? (data.breach?.reason ?? null) : null;
    try { await advanceChallenge({ account_id: data.account_id, to_phase: toPhase, mark, breach_reason }); onChanged(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="prop-controls">
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Edit rules'}</button>
      {data.phase === 'p1' && <button className="btn-ghost" disabled={busy} onClick={() => advance('p2', 'passed')}>Mark Phase 1 passed →</button>}
      {data.phase === 'p2' && <button className="btn-ghost" disabled={busy} onClick={() => advance('funded', 'passed')}>Mark Phase 2 passed →</button>}
      <button className="btn-ghost danger" disabled={busy} onClick={() => advance(data.phase, 'breached')}>Reset (new challenge)</button>

      {open && (
        <div className="prop-rules-form">
          <label>Start balance<input type="number" value={form.start_balance} onChange={(e) => set('start_balance', e.target.value)} /></label>
          <label>Daily DD %<input type="number" step="0.1" value={form.daily_dd_pct} onChange={(e) => set('daily_dd_pct', e.target.value)} /></label>
          <label>Max DD %<input type="number" step="0.1" value={form.max_dd_pct} onChange={(e) => set('max_dd_pct', e.target.value)} /></label>
          <label>DD type
            <select value={form.dd_type} onChange={(e) => set('dd_type', e.target.value)}>
              <option value="static">Static</option>
              <option value="trailing">Trailing</option>
            </select>
          </label>
          <label>Min trading days<input type="number" value={form.min_trading_days} onChange={(e) => set('min_trading_days', e.target.value)} /></label>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save rules'}</button>
          {err && <div className="prop-err">{err}</div>}
        </div>
      )}
    </div>
  );
}

// A compact portfolio card in the god view.
function PortfolioCard({ data, onOpen }) {
  if (!data.challenge && !data.maxDd) {
    return (
      <button className="prop-pcard" onClick={onOpen}>
        <div className="prop-pcard-head"><span className="prop-pcard-name">{data.label || `Account ${data.account_id}`}</span></div>
        <div className="muted">No challenge configured</div>
      </button>
    );
  }
  const st = healthStatus(data.health.score, data.breach.breached);
  return (
    <button className="prop-pcard" onClick={onOpen}>
      <div className="prop-pcard-head">
        <span className="prop-pcard-name">{data.label || `Account ${data.account_id}`}</span>
        <PhaseBadge phase={data.phase} status={data.status} />
      </div>
      <div className="prop-pcard-body">
        <div className={`prop-pcard-score ${st}`}>{data.breach.breached ? '0' : data.health.score}<span>health</span></div>
        <div className="prop-pcard-meters">
          <MiniBar label="Max DD" frac={data.maxDd?.fracRemaining} breached={data.maxDd?.breached} />
          <MiniBar label="Daily" frac={data.dailyDd?.fracRemaining} breached={data.dailyDd?.breached} />
        </div>
      </div>
      {data.breach.breached && <div className="prop-pcard-breach">Breached</div>}
    </button>
  );
}

function MiniBar({ label, frac, breached }) {
  const st = roomStatus(frac, breached);
  return (
    <div className={`prop-mini ${st}`}>
      <span className="muted">{label}</span>
      <div className="prop-mini-track"><div className="prop-mini-fill" style={{ width: `${Math.round(clamp01(frac) * 100)}%` }} /></div>
    </div>
  );
}

export default function PropOS() {
  const { accountId, setAccountId, connected, toggleSidebar, accounts = [], fees = [], reloadFees } = useOutletContext();
  const [data, setData] = useState(null);
  const [fin, setFin] = useState(null);
  const [ins, setIns] = useState(null);
  const [err, setErr] = useState(null);
  const [feesOpen, setFeesOpen] = useState(false);

  function load() {
    setErr(null);
    fetchProp(accountId).then(setData).catch((e) => setErr(e.message));
    fetchPropFinance(accountId).then(setFin).catch(() => {});
    fetchPropInsights(accountId).then(setIns).catch(() => {});
  }
  useEffect(() => { setData(null); setFin(null); setIns(null); load(); /* eslint-disable-next-line */ }, [accountId]);

  // Finance band + insights + fees modal shown on every Prop OS view.
  const finance = (
    <>
      <FinanceBand fin={fin} onLogFee={() => setFeesOpen(true)} />
      <InsightsBand ins={ins} />
      {feesOpen && (
        <FeesModal
          fees={fees}
          accounts={accounts}
          defaultLogin={accountId === 'all' ? undefined : accountId}
          onClose={() => setFeesOpen(false)}
          onChanged={() => { reloadFees?.(); load(); }}
        />
      )}
    </>
  );

  const mode = data && !data.god ? data.mode : null;
  const modeBadge = mode && (
    <span className={`prop-mode ${mode}`} title={mode === 'live' ? 'Drawdown from live EA equity' : 'Drawdown from closed trades (connect the EA for live floating equity)'}>
      {mode === 'live' ? 'Live equity' : 'Realized'}
    </span>
  );

  const page = (body) => (
    <div className="page">
      <PageHeader title="Prop OS" connected={connected} onMenu={toggleSidebar} right={modeBadge} />
      {body}
    </div>
  );

  if (err) return page(<div className="banner error">Could not load Prop OS: {err}</div>);
  if (!data) return page(<LoadingBlock label="Loading Prop OS" />);

  // God / portfolio view.
  if (data.god) {
    if (!data.accounts.length) {
      return page(<>{finance}<div className="prop-empty">No accounts yet. Add one to start tracking challenges.</div></>);
    }
    return page(
      <>
        {finance}
        <div className="prop-portfolio">
          {data.accounts.map((a) => (
            <PortfolioCard key={a.account_id} data={a} onOpen={() => setAccountId(String(a.account_id))} />
          ))}
        </div>
      </>
    );
  }

  // Single account.
  if (data.challenge === null) {
    return page(<>{finance}<div className="prop-empty">This account has no active challenge.</div></>);
  }
  return page(
    <>
      {finance}
      <div className="prop-single">
        <div className="prop-single-head">
          <PhaseBadge phase={data.phase} status={data.status} />
          <span className="prop-single-name">{data.label}</span>
        </div>
        <AccountDetail data={data} editable onChanged={load} />
      </div>
    </>
  );
}
