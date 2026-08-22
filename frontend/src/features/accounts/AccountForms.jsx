import React, { useState } from 'react';
import { Modal } from '@/components/primitives';
import { Link } from 'react-router-dom';
import { createAccount, updateAccount, INGEST_URL, INGEST_ORIGIN, EA_DOWNLOAD_URL } from '../../lib/api.js';
import { useAuth } from '../../app/AuthContext.jsx';
import { PROP_FIRMS, findFirm, findProduct, templateToFields } from '../prop/propFirms.js';

// ---------------------------------------------------------------------------
// The account FORMS — the shared field components plus the two dialogs that host
// them. Everything about adding, editing and wiring up a trading account is here;
// nothing here LISTS accounts.
//
// THIS FILE USED TO BE `AccountsModal.jsx`, ONE MODAL THAT DID ALL FOUR JOBS: it
// listed every account, added one, edited one inline and showed the EA setup, and it
// was opened from three places. The list half moved to Settings > Accounts, where it
// is a table with a row menu (SettingsAccounts.jsx) — so what was left was a modal
// that showed a second, smaller copy of the same list underneath a form. Two lists of
// the same accounts, one of them inside a dialog opened from the other, is the
// duplication this split removes.
//
// So the modal became two, each answering one question:
//
//   AccountFormModal   add an account, or edit one's rules
//   EaSetupModal       how do I get trades flowing into this account
//
// WHAT DID NOT CHANGE, AND DELIBERATELY: the fields. `TemplatePicker`, `PropFields`,
// `SetupCard`, `toPayload` and `formFrom` are the same components and the same
// arithmetic they always were, because the onboarding wizard renders them too
// (Onboarding.jsx) and a second copy of a drawdown field is how a rule ends up
// meaning one thing on first run and another afterwards.
// ---------------------------------------------------------------------------

// Human size label: 50000 -> "50K".
const sizeLabel = (n) => (Number(n) >= 1000 ? `${Number(n) / 1000}K` : String(n));

// Prop-firm template picker: choose firm → size → phase, then Apply to pre-fill
// the rule fields below (all still editable). Catalog lives in propFirms.js.
// onApply(fields, suggestedLabel) — suggestedLabel is used only by the add form.
// Exported so the onboarding wizard reuses the exact same picker.
export function TemplatePicker({ onApply }) {
  const [firmId, setFirmId] = useState('');
  const [productId, setProductId] = useState('');
  const [size, setSize] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const firm = findFirm(firmId);
  const product = findProduct(firmId, productId);

  // Each selection invalidates the ones that depend on it: products are per firm,
  // and sizes and phases are per PRODUCT. Without this, picking 2-Step, then
  // switching to Instant Funding, leaves "Phase 1" selected — a phase Instant
  // Funding does not have — and templateToFields returns null on Apply.
  const pickFirm = (id) => { setFirmId(id); setProductId(''); setSize(''); setPhaseId(''); };
  const pickProduct = (id) => { setProductId(id); setSize(''); setPhaseId(''); };

  const ready = Boolean(product) && size !== '' && phaseId !== '';
  const apply = () => {
    const fields = templateToFields(firmId, productId, Number(size), phaseId);
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
        <select value={productId} onChange={(e) => pickProduct(e.target.value)} disabled={!firm} aria-label="Account type">
          <option value="">Account type…</option>
          {firm?.products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} disabled={!product} aria-label="Account size">
          <option value="">Size…</option>
          {product?.sizes.map((s) => <option key={s} value={s}>{sizeLabel(s)}</option>)}
        </select>
        <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} disabled={!product} aria-label="Phase">
          <option value="">Phase…</option>
          {product?.phases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
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
  product_id: v.product_id || null,
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
  product_id: a?.product_id ?? null,
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
  product_id: fields.product_id ?? null,
});

// ---------------------------------------------------------------------------
// AccountFormModal — add an account, or edit an existing one's rules.
//
// ONE COMPONENT FOR BOTH, because the two forms are the same form minus one field.
// Adding asks which KIND of account it is (a manual bucket or a live EA-synced one),
// and that question has exactly one right moment: a synced account is provisioned
// with an ingest token and a manual one is given a synthetic login, so `kind` is not
// editable afterwards by design (see domain/accounts/accounts.js). Everything else —
// the label, the firm template, the six rule fields — is identical, and writing it
// twice is how an edit form ends up missing the field an add form gained.
//
// ADDING A SYNCED ACCOUNT CONTINUES INTO ITS EA SETUP RATHER THAN CLOSING. The
// account exists at that point but no trades reach it until the EA is attached, so
// closing on success would leave a row reading "Waiting for first trade" with no
// indication of what the user is waiting for. A manual account needs nothing, so it
// closes immediately. That is the behaviour the old modal had; it is written down
// here because it is the one place the two kinds diverge after submit.
// ---------------------------------------------------------------------------

export function AccountFormModal({ mode = 'add', account = null, onClose, onSaved }) {
  const { user } = useAuth();
  const eaOk = eaAllowed(user?.plan);
  const editing = mode === 'edit';

  const [label, setLabel] = useState(account?.label || '');
  // Default to EA sync where the plan allows it — that is what a trader adding a prop
  // account almost always wants; the manual bucket is the deliberate choice.
  const [kind, setKind] = useState(eaOk ? 'synced' : 'manual');
  const [v, setV] = useState(formFrom(account));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Set once a synced account has been created — the dialog's second step.
  const [created, setCreated] = useState(null);
  const set = (f, val) => setV((p) => ({ ...p, [f]: val }));

  async function submit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      if (editing) {
        await updateAccount(account.id, { label: label.trim(), ...toPayload(v) });
        onSaved?.();
        onClose?.();
      } else {
        const acct = await createAccount({ label: label.trim(), kind, ...toPayload(v) });
        onSaved?.();
        // See the header: a synced account continues to its EA setup, a manual one is
        // ready the moment it exists.
        if (acct.kind === 'manual') onClose?.();
        else setCreated(acct);
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? 'Edit Account' : 'Add Account';

  if (created) {
    return (
      <Modal onClose={onClose} className="acct-form-modal" label="Finish EA setup">
        <div className="modal-head">
          <h3>Finish EA Setup</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>
        <div className="acct-form-body">
          <div className="acct-created">
            <div className="acct-created-head">
              &ldquo;{created.label}&rdquo; created. Attach the EA to start syncing:
            </div>
          </div>
          <SetupCard account={created} />
        </div>
        <div className="acct-form-foot">
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} className="acct-form-modal" label={title}>
      <div className="modal-head">
        <h3>{title}</h3>
        <button className="modal-x" onClick={onClose} aria-label="Close">&#10005;</button>
      </div>
      <form className="acct-form-body" onSubmit={submit}>
        {/* Kind is an add-time decision only — see the header. */}
        {!editing && (
          <>
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
                Want live sync? <Link to="/billing" onClick={onClose}>Upgrade to Pro &rarr;</Link>
              </div>
            )}
          </>
        )}

        <label className="acct-form-field">
          <span>Account name</span>
          <input
            placeholder="e.g. FTMO Challenge #1"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>

        {/* Picking a firm and a size pre-fills the six rule fields below, all still
            editable. On the edit form it is a correction tool: choose the template the
            account should have been on and the fields catch up. */}
        <TemplatePicker onApply={(fields, suggested) => {
          setV((p) => applyTemplateToForm(p, fields));
          if (!label.trim() && suggested) setLabel(suggested);
        }} />
        <PropFields v={v} set={set} />
        {err && <div className="login-error">{err}</div>}

        <div className="acct-form-foot">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy || !label.trim()}>
            {busy ? (editing ? 'Saving…' : 'Adding…') : (editing ? 'Save Changes' : 'Add Account')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// EaSetupModal — the three EA steps for an account that already exists, reached from
// the accounts table's row menu. The steps themselves are `SetupCard`, the same
// component the add flow's second step renders, so "how do I attach the EA" has one
// answer whether it is asked at creation or a month later.
// ---------------------------------------------------------------------------

export function EaSetupModal({ account, onClose }) {
  return (
    <Modal onClose={onClose} className="acct-form-modal" label="EA setup">
      <div className="modal-head">
        <h3>EA Setup</h3>
        <button className="modal-x" onClick={onClose} aria-label="Close">&#10005;</button>
      </div>
      <div className="acct-form-body">
        <div className="acct-form-subject">{account?.label}</div>
        <SetupCard account={account} />
      </div>
      <div className="acct-form-foot">
        <button type="button" className="primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
