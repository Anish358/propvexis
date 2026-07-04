import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import Explain from './Explain.jsx';
import { fetchProp, advanceChallenge, updateAccount } from './api.js';
import { fmtMoney } from './metrics.js';

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
    try { await advanceChallenge({ account_id: data.account_id, to_phase: toPhase, mark }); onChanged(); }
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
  const { accountId, setAccountId, connected, toggleSidebar } = useOutletContext();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  function load() {
    setErr(null);
    fetchProp(accountId).then(setData).catch((e) => setErr(e.message));
  }
  useEffect(() => { setData(null); load(); /* eslint-disable-next-line */ }, [accountId]);

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
  if (!data) return page(<div className="dash-loading">Loading Prop OS…</div>);

  // God / portfolio view.
  if (data.god) {
    if (!data.accounts.length) return page(<div className="prop-empty">No accounts yet. Add one to start tracking challenges.</div>);
    return page(
      <div className="prop-portfolio">
        {data.accounts.map((a) => (
          <PortfolioCard key={a.account_id} data={a} onOpen={() => setAccountId(String(a.account_id))} />
        ))}
      </div>
    );
  }

  // Single account.
  if (data.challenge === null) {
    return page(<div className="prop-empty">This account has no active challenge.</div>);
  }
  return page(
    <div className="prop-single">
      <div className="prop-single-head">
        <PhaseBadge phase={data.phase} status={data.status} />
        <span className="prop-single-name">{data.label}</span>
      </div>
      <AccountDetail data={data} editable onChanged={load} />
    </div>
  );
}
