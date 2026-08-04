import React, { useState } from 'react';
// PHASE 4b — on the shared Modal shell. This modal had no Escape, no role, no focus
// trap, no focus return and no scroll lock; all five come from the shell now, and the
// hand-rolled portal is gone with it. Its content below is untouched.
import { Modal } from '@/components/primitives';
import { Link } from 'react-router-dom';
import { createAccount, updateAccount, deleteAccount, INGEST_URL, INGEST_ORIGIN, EA_DOWNLOAD_URL } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { PROP_FIRMS, findFirm, templateToFields } from './propFirms.js';

// Human size label: 50000 -> "50K".
const sizeLabel = (n) => (Number(n) >= 1000 ? `${Number(n) / 1000}K` : String(n));

// Prop-firm template picker: choose firm → size → phase, then Apply to pre-fill
// the rule fields below (all still editable). Catalog lives in propFirms.js.
// onApply(fields, suggestedLabel) — suggestedLabel is used only by the add form.
// Exported so the onboarding wizard reuses the exact same picker.
export function TemplatePicker({ onApply }) {
  const [firmId, setFirmId] = useState('');
  const [size, setSize] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const firm = findFirm(firmId);

  const pickFirm = (id) => { setFirmId(id); setSize(''); setPhaseId(''); };
  const ready = firm && size !== '' && phaseId !== '';
  const apply = () => {
    const fields = templateToFields(firmId, Number(size), phaseId);
    if (fields) onApply(fields, `${firm.name} ${sizeLabel(size)}`);
  };

  return (
    <div className="acct-template">
      <div className="acct-template-head">Prefill from a prop firm <span className="acct-template-opt">(optional)</span></div>
      <div className="acct-template-row">
        <select value={firmId} onChange={(e) => pickFirm(e.target.value)} aria-label="Prop firm">
          <option value="">Firm…</option>
          {PROP_FIRMS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} disabled={!firm} aria-label="Account size">
          <option value="">Size…</option>
          {firm?.sizes.map((s) => <option key={s} value={s}>{sizeLabel(s)}</option>)}
        </select>
        <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} disabled={!firm} aria-label="Phase">
          <option value="">Phase…</option>
          {firm?.phases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="button" className="acct-template-apply" onClick={apply} disabled={!ready}>Apply</button>
      </div>
    </div>
  );
}

// EA attach (a synced MT5 account) is a Pro+ feature. Free users see an upgrade
// prompt instead of the add-account form. The backend enforces the real cap;
// this is just the UI gate. (Only 'free' lacks EA — pro & premium both have it.)
export const eaAllowed = (plan) => plan === 'pro' || plan === 'premium';

// EA setup card shown for an account. The downloaded EA is pre-filled with this
// account's ingest endpoint + token (injected client-side), so the user just
// downloads and attaches — no in-MT5 configuration. The MT5 login auto-binds
// from the first trade.
export function SetupCard({ account }) {
  const [copied, setCopied] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [dlError, setDlError] = useState(null);
  const copy = (text, what) => {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  // Fetch the raw EA source and inject this account's endpoint + token into the
  // input defaults, then download the personalized file.
  async function downloadEA() {
    setPreparing(true);
    setDlError(null);
    try {
      const res = await fetch(EA_DOWNLOAD_URL);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      let text = await res.text();
      text = text
        .replace(/(input string InpBackendUrl\s*=\s*")[^"]*(")/, `$1${INGEST_URL}$2`)
        .replace(/(input string InpIngestToken\s*=\s*")[^"]*(")/, `$1${account.ingest_token}$2`);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'PropVexis.mq5';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlError(e.message);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="acct-setup">
      <ol className="acct-steps">
        <li>
          <b>Download</b> the EA — it's already pre-filled with this account's endpoint and token. Drop it into your MT5 <code>MQL5/Experts</code> folder (compile in MetaEditor if needed) and attach it to any chart.
          <div className="acct-copy">
            <button className="ea-download" onClick={downloadEA} disabled={preparing}>
              {preparing ? 'Preparing…' : '⬇ Download PropVexis.mq5'}
            </button>
          </div>
          {dlError && <div className="login-error">{dlError}</div>}
        </li>
        <li>
          In MT5: Tools → Options → Expert Advisors → tick <b>Allow WebRequest</b> and add this URL
          <span className="muted"> (the host — covers trade + payout sync)</span>:
          <div className="acct-copy">
            <code>{INGEST_ORIGIN}</code>
            <button onClick={() => copy(INGEST_ORIGIN, 'url')}>{copied === 'url' ? 'Copied' : 'Copy'}</button>
          </div>
        </li>
        <li><b>Place your first trade</b> — it auto-links this MT5 account and tracking begins.</li>
      </ol>
    </div>
  );
}

// Prop-firm config fields shared by the add + edit forms. `v` holds the current
// values; `set(field, value)` updates one. Limits are percentages of the start
// balance; profit target only applies to eval accounts.
export function PropFields({ v, set }) {
  return (
    <div className="acct-prop">
      <label>
        <span>Type</span>
        <select value={v.account_type} onChange={(e) => set('account_type', e.target.value)}>
          <option value="eval">Evaluation</option>
          <option value="funded">Funded</option>
        </select>
      </label>
      <label>
        <span>Start balance ($)</span>
        <input type="number" value={v.start_balance} onChange={(e) => set('start_balance', e.target.value)} placeholder="50000" />
      </label>
      <label>
        <span>Daily DD (%)</span>
        <input type="number" step="0.1" value={v.daily_dd_pct} onChange={(e) => set('daily_dd_pct', e.target.value)} placeholder="5" />
      </label>
      <label>
        <span>Max DD (%)</span>
        <input type="number" step="0.1" value={v.max_dd_pct} onChange={(e) => set('max_dd_pct', e.target.value)} placeholder="10" />
      </label>
      <label>
        <span>DD type</span>
        <select value={v.dd_type} onChange={(e) => set('dd_type', e.target.value)}>
          <option value="static">Static (balance floor)</option>
          <option value="trailing">Trailing</option>
        </select>
      </label>
      <label>
        <span>Min trading days</span>
        <input type="number" step="1" value={v.min_trading_days} onChange={(e) => set('min_trading_days', e.target.value)} placeholder="0" />
      </label>
      {v.account_type === 'eval' && (
        <label>
          <span>Profit target (%)</span>
          <input type="number" step="0.1" value={v.profit_target_pct} onChange={(e) => set('profit_target_pct', e.target.value)} placeholder="8" />
        </label>
      )}
      {v.account_type === 'funded' && (
        <label>
          <span>Profit split (%)</span>
          <input type="number" step="1" value={v.payout_split_pct} onChange={(e) => set('payout_split_pct', e.target.value)} placeholder="80" />
        </label>
      )}
    </div>
  );
}

// Turn form strings into the numeric/typed payload the API expects.
const numOrNull = (s) => (s === '' || s == null ? null : Number(s));
export const toPayload = (v) => ({
  account_type: v.account_type,
  start_balance: numOrNull(v.start_balance),
  daily_dd_pct: numOrNull(v.daily_dd_pct),
  max_dd_pct: numOrNull(v.max_dd_pct),
  profit_target_pct: numOrNull(v.profit_target_pct),
  payout_split_pct: numOrNull(v.payout_split_pct),
  dd_type: v.dd_type || 'static',
  min_trading_days: numOrNull(v.min_trading_days),
  firm_id: v.firm_id || null,
  firm_name: v.firm_name || null,
});

export const formFrom = (a) => ({
  account_type: a?.account_type || 'eval',
  start_balance: a?.start_balance ?? '',
  daily_dd_pct: a?.daily_dd_pct ?? '',
  max_dd_pct: a?.max_dd_pct ?? '',
  profit_target_pct: a?.profit_target_pct ?? '',
  payout_split_pct: a?.payout_split_pct ?? '',
  dd_type: a?.dd_type || 'static',
  min_trading_days: a?.min_trading_days ?? '',
  firm_id: a?.firm_id ?? null,
  firm_name: a?.firm_name ?? null,
});

// Merge a template's resolved fields (numbers/nulls from templateToFields) into
// the string-based form state; null → '' so inputs stay controlled.
export const applyTemplateToForm = (prev, fields) => ({
  ...prev,
  account_type: fields.account_type,
  start_balance: fields.start_balance ?? '',
  daily_dd_pct: fields.daily_dd_pct ?? '',
  max_dd_pct: fields.max_dd_pct ?? '',
  profit_target_pct: fields.profit_target_pct ?? '',
  payout_split_pct: fields.payout_split_pct ?? '',
  dd_type: fields.dd_type ?? 'static',
  min_trading_days: fields.min_trading_days ?? '',
  firm_id: fields.firm_id ?? null,
  firm_name: fields.firm_name ?? null,
});

// Inline editor for an existing account's prop-firm config.
function EditForm({ account, onSaved, onCancel }) {
  const [v, setV] = useState(formFrom(account));
  const [busy, setBusy] = useState(false);
  const set = (f, val) => setV((p) => ({ ...p, [f]: val }));
  async function save() {
    setBusy(true);
    try {
      await updateAccount(account.id, toPayload(v));
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="acct-edit">
      <TemplatePicker onApply={(fields) => setV((p) => applyTemplateToForm(p, fields))} />
      <PropFields v={v} set={set} />
      <div className="acct-edit-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

export default function AccountsModal({ accounts = [], onClose, onChanged }) {
  const { user } = useAuth();
  const eaOk = eaAllowed(user?.plan); // may create live-synced (EA) accounts
  const [label, setLabel] = useState('');
  // 'manual' = a no-sync bucket to segregate manual/CSV trades (any plan);
  // 'synced' = a live EA-linked account (Pro+). Default to EA when allowed.
  const [kind, setKind] = useState(eaOk ? 'synced' : 'manual');
  const [v, setV] = useState(formFrom(null));
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // freshly created account -> show its setup
  const [openSetupId, setOpenSetupId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [err, setErr] = useState(null);
  const [showAdd, setShowAdd] = useState(false); // add form hidden until user opts in
  const set = (f, val) => setV((p) => ({ ...p, [f]: val }));

  async function add(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const acct = await createAccount({ label: label.trim(), kind, ...toPayload(v) });
      setCreated(acct);
      setLabel('');
      setV(formFrom(null));
      setShowAdd(false);
      onChanged?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this account? Its trades stay but become unlinked.')) return;
    await deleteAccount(id);
    if (created?.id === id) setCreated(null);
    onChanged?.();
  }

  // Archive/unarchive: soft toggle via is_active. Archived accounts drop out of
  // the switcher but keep their trades and can be restored here.
  async function toggleArchive(a) {
    await updateAccount(a.id, { is_active: a.is_active === false });
    onChanged?.();
  }

  const acctType = (a) => (a.account_type === 'funded' ? 'Funded' : 'Eval');
  const isArchived = (a) => a.is_active === false;
  // Newest account first (most recently added at the top).
  const sorted = [...accounts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <Modal onClose={onClose} className="acct-modal" label="MT5 Accounts">
        <div className="modal-head">
          <h3>MT5 Accounts</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        {/* add account toggle — centered at the top; the form is hidden until opened */}
        <div className="acct-add-toggle">
          <button type="button" className="acct-add-btn" onClick={() => { setShowAdd((s) => !s); setErr(null); }}>
            {showAdd ? 'Cancel' : '+ Add account'}
          </button>
        </div>

        {/* add form — only shown once the user clicks "Add account" */}
        {showAdd && (
          <form className="acct-add" onSubmit={add}>
            {/* Kind picker: a manual bucket (any plan) vs live EA sync (Pro+). */}
            <div className="acct-kind">
              <label className={`acct-kind-opt ${kind === 'manual' ? 'sel' : ''}`}>
                <input type="radio" name="acct-kind" checked={kind === 'manual'} onChange={() => setKind('manual')} />
                <span><b>Manual account</b><small>Group manual / CSV trades into their own per-account view. No live sync.</small></span>
              </label>
              <label className={`acct-kind-opt ${kind === 'synced' ? 'sel' : ''} ${eaOk ? '' : 'disabled'}`}>
                <input type="radio" name="acct-kind" checked={kind === 'synced'} disabled={!eaOk} onChange={() => setKind('synced')} />
                <span>
                  <b>Live MT5 (EA sync){eaOk ? '' : ' — Pro'}</b>
                  <small>Auto-import trades from MetaTrader via the EA. {eaOk ? '' : 'Requires the Pro plan.'}</small>
                </span>
              </label>
            </div>
            {!eaOk && (
              <div className="acct-kind-upsell">
                Want live sync? <Link to="/billing" onClick={onClose}>Upgrade to Pro →</Link>
              </div>
            )}
            <div className="acct-add-row">
              <input
                placeholder="Account label (e.g. GFT Challenge #1)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <button type="submit" disabled={busy || !label.trim()}>{busy ? 'Adding…' : '+ Add account'}</button>
            </div>
            <TemplatePicker onApply={(fields, suggested) => {
              setV((p) => applyTemplateToForm(p, fields));
              if (!label.trim() && suggested) setLabel(suggested);
            }} />
            <PropFields v={v} set={set} />
            {err && <div className="login-error">{err}</div>}
          </form>
        )}

        {/* freshly created -> manual accounts are ready now; synced ones need EA setup */}
        {created && (
          <div className="acct-created">
            {created.kind === 'manual' ? (
              <div className="acct-created-head">✓ “{created.label}” created — switch to it in the account picker to log or import trades there.</div>
            ) : (
              <>
                <div className="acct-created-head">✓ “{created.label}” created. Finish setup in your EA:</div>
                <SetupCard account={created} />
              </>
            )}
          </div>
        )}

        {/* existing accounts, newest first */}
        <div className="acct-list">
          {accounts.length === 0 && <div className="acct-empty">No accounts yet — add one above.</div>}
          {sorted.map((a) => (
            <div key={a.id} className={`acct-row${isArchived(a) ? ' archived' : ''}`}>
              <div className="acct-row-main">
                <div className="acct-row-label">{a.label}</div>
                <div className="acct-row-meta">
                  {a.kind === 'manual' ? (
                    <span className="acct-badge manual">✎ Manual</span>
                  ) : a.pending ? (
                    <span className="acct-badge pending">● Waiting for first trade</span>
                  ) : (
                    <span className="acct-badge bound">MT5 {a.mt5_login}</span>
                  )}
                  <span className="acct-badge type">{acctType(a)}</span>
                  {isArchived(a) && <span className="acct-badge archived">Archived</span>}
                </div>
              </div>
              <div className="acct-row-actions">
                <button onClick={() => { setEditId(editId === a.id ? null : a.id); setOpenSetupId(null); }}>
                  {editId === a.id ? 'Close' : 'Edit'}
                </button>
                {a.kind !== 'manual' && (
                  <button onClick={() => { setOpenSetupId(openSetupId === a.id ? null : a.id); setEditId(null); }}>
                    {openSetupId === a.id ? 'Hide setup' : 'Setup'}
                  </button>
                )}
                <button onClick={() => toggleArchive(a)}>{isArchived(a) ? 'Unarchive' : 'Archive'}</button>
                <button className="danger" onClick={() => remove(a.id)}>Delete</button>
              </div>
              {editId === a.id && (
                <EditForm account={a} onCancel={() => setEditId(null)} onSaved={() => { setEditId(null); onChanged?.(); }} />
              )}
              {openSetupId === a.id && a.kind !== 'manual' && <SetupCard account={a} />}
            </div>
          ))}
        </div>
    </Modal>
  );
}
