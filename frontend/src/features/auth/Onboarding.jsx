import React, { useState } from 'react';
import { useAuth } from '../../app/AuthContext.jsx';
import { BRAND } from '../../lib/theme.js';
import { createAccount, completeOnboarding } from '../../lib/api.js';
import {
  TemplatePicker, PropFields, SetupCard,
  eaAllowed, toPayload, formFrom, applyTemplateToForm,
} from '../accounts/AccountForms.jsx';

const STEPS = ['Welcome', 'First account', 'Done'];

// First-run setup wizard. Shown once (gated on user.onboarded_at in App). Reuses
// the account form pieces from AccountForms so there's one source of truth for
// adding an account. onDone(updatedUser) hands the onboarded user back to auth.
export default function Onboarding({ onDone }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishErr, setFinishErr] = useState(null);
  const firstName = (user?.name || '').trim().split(' ')[0];

  async function finish() {
    setFinishing(true);
    setFinishErr(null);
    try {
      const updated = await completeOnboarding();
      onDone?.(updated);
    } catch (e) {
      setFinishErr('Could not finish setup — please try again.');
      setFinishing(false);
    }
  }

  return (
    <div className="onb-screen">
      <div className="onb-card">
        <div className="onb-top">
          <div className="onb-brand">{BRAND}</div>
          <ol className="onb-steps" aria-label="Setup progress">
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'cur' : i < step ? 'done' : ''}>
                <span className="onb-dot" />{s}
              </li>
            ))}
          </ol>
        </div>

        {step === 0 && <Welcome firstName={firstName} onNext={() => setStep(1)} />}
        {step === 1 && <FirstAccount onNext={() => setStep(2)} onSkip={() => setStep(2)} />}
        {step === 2 && <Done finishing={finishing} error={finishErr} onFinish={finish} />}
      </div>
    </div>
  );
}

function Welcome({ firstName, onNext }) {
  const pillars = [
    { t: 'Journal', d: 'Every trade in R and dollars — calendar, analytics and replay.' },
    { t: 'Prop OS', d: 'Track challenge rules, drawdown headroom and payouts.' },
    { t: 'Reports', d: 'Composed reports you can export to PDF or CSV.' },
  ];
  return (
    <div className="onb-body">
      <h2 className="onb-h">Welcome{firstName ? `, ${firstName}` : ''} 👋</h2>
      <p className="onb-sub">{BRAND} is your trading operating system. Here's what you get:</p>
      <div className="onb-pillars">
        {pillars.map((p) => (
          <div key={p.t} className="onb-pillar">
            <div className="onb-pillar-t">{p.t}</div>
            <div className="onb-pillar-d">{p.d}</div>
          </div>
        ))}
      </div>
      <div className="onb-actions onb-actions-end">
        <button className="onb-primary" onClick={onNext}>Get started</button>
      </div>
    </div>
  );
}

function FirstAccount({ onNext, onSkip }) {
  const { user } = useAuth();
  const eaOk = eaAllowed(user?.plan);
  const [kind, setKind] = useState(eaOk ? 'synced' : 'manual');
  const [label, setLabel] = useState('');
  const [v, setV] = useState(formFrom(null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [created, setCreated] = useState(null);
  const set = (f, val) => setV((p) => ({ ...p, [f]: val }));

  async function add(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const acct = await createAccount({ label: label.trim(), kind, ...toPayload(v) });
      setCreated(acct);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="onb-body">
        <h2 className="onb-h">✓ "{created.label}" is ready</h2>
        {created.kind === 'synced' ? (
          <>
            <p className="onb-sub">Finish the EA setup now, or later from Account → Accounts.</p>
            <SetupCard account={created} />
          </>
        ) : (
          <p className="onb-sub">Switch to it in the account picker to log or import trades there.</p>
        )}
        <div className="onb-actions onb-actions-end">
          <button className="onb-primary" onClick={onNext}>Continue</button>
        </div>
      </div>
    );
  }

  return (
    <form className="onb-body" onSubmit={add}>
      <h2 className="onb-h">Add your first trading account</h2>
      <p className="onb-sub">Track a prop-firm challenge or a manual journal — you can add more anytime.</p>

      <div className="acct-kind">
        <label className={`acct-kind-opt ${kind === 'manual' ? 'sel' : ''}`}>
          <input type="radio" name="onb-kind" checked={kind === 'manual'} onChange={() => setKind('manual')} />
          <span><b>Manual account</b><small>Log or import trades into their own per-account view. No live sync.</small></span>
        </label>
        <label className={`acct-kind-opt ${kind === 'synced' ? 'sel' : ''} ${eaOk ? '' : 'disabled'}`}>
          <input type="radio" name="onb-kind" checked={kind === 'synced'} disabled={!eaOk} onChange={() => setKind('synced')} />
          <span>
            <b>Live MT5 (EA sync){eaOk ? '' : ' — Pro'}</b>
            <small>Auto-import trades from MetaTrader via the EA. {eaOk ? '' : 'Upgrade to Pro later in Billing.'}</small>
          </span>
        </label>
      </div>

      <div className="acct-add-row">
        <input
          placeholder="Account label (e.g. GFT Challenge #1)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <TemplatePicker onApply={(fields, suggested) => {
        setV((p) => applyTemplateToForm(p, fields));
        if (!label.trim() && suggested) setLabel(suggested);
      }} />
      <PropFields v={v} set={set} />
      {err && <div className="login-error">{err}</div>}

      <div className="onb-actions">
        <button type="button" className="onb-ghost" onClick={onSkip}>Skip for now</button>
        <button type="submit" className="onb-primary" disabled={busy || !label.trim()}>
          {busy ? 'Adding…' : 'Add account'}
        </button>
      </div>
    </form>
  );
}

function Done({ finishing, error, onFinish }) {
  return (
    <div className="onb-body onb-done">
      <div className="onb-check">✓</div>
      <h2 className="onb-h">You're all set</h2>
      <p className="onb-sub">Jump into your dashboard — log a trade, import a CSV, or attach the EA whenever you're ready.</p>
      {error && <div className="login-error">{error}</div>}
      <div className="onb-actions onb-actions-end">
        <button className="onb-primary" onClick={onFinish} disabled={finishing}>
          {finishing ? 'Finishing…' : 'Go to dashboard'}
        </button>
      </div>
    </div>
  );
}
