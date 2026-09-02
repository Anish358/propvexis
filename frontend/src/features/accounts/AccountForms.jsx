import React, { useState } from 'react';
import { Modal } from '@/components/primitives';
import { updateAccount, INGEST_URL, INGEST_ORIGIN, EA_DOWNLOAD_URL } from '../../lib/api.js';
import { PROP_FIRMS, findFirm, findProduct, templateToFields, sizeLabel } from '../prop/propFirms.js';

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
//   AccountEditModal   correct an existing account's label and rules
//   EaSetupModal       how do I get trades flowing into this account
//
// NEITHER OF THEM ADDS ANY MORE. Creating an account is the Add Account wizard at
// /accounts/new, and it is the only way (spec §2 decision 7).
//
// WHAT DID NOT CHANGE, AND DELIBERATELY: the fields. `TemplatePicker`, `PropFields`,
// `SetupCard`, `toPayload` and `formFrom` are the same components and the same
// arithmetic they always were. The reason has moved rather than gone: they used to be
// shared with Onboarding.jsx's duplicate form, and that file is deleted — but a second
// copy of a drawdown field is still how a rule ends up meaning one thing in the wizard
// and another in this dialog.
// ---------------------------------------------------------------------------

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
          {/* The custom product has no sizes and no phases by design — the Add
              Account wizard collects those by hand. In this picker it would be a
              choice that leaves Size and Phase empty and Apply disabled forever. */}
          {firm?.products.filter((p) => !p.custom).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
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

// The plan gate moved to accountGating.js — a JSX file cannot be imported by
// node:test, and the wizard's `import` step needs the cap NUMBER as well as this
// predicate.
//
// A PURE PASS-THROUGH NOW, and that is a change worth recording rather than a
// simplification to make quietly. This file used to CALL eaAllowed — the add form's
// kind radios were gated on it — which is why it imported the binding and re-exported
// it separately: `export { x } from './y'` creates an export entry without a local
// binding, so a bare call site throws ReferenceError at render, and nothing here
// catches that (no bundler scope-checks it, and this repo cannot render JSX in a
// test). That hazard is gone with the add branch; the re-export stays only because
// SettingsPanels imports eaAllowed through this module.
export { eaAllowed } from './accountGating.js';

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
      {/* THE CONSISTENCY RULE (migration 0032). No toggle here, unlike the Add Account
          wizard: this form is a plain grid of numbers where BLANK already means "this
          account has no such rule" for every optional field on it, and a switch in one
          cell of the old look would be the only one of its kind. Clearing the box is
          how the rule is turned off, and numOrNull sends that as null.
          A 0 typed here is not refused by the PATCH route the way the wizard's provision
          refuses it — but consistencyState reads any cap that is not > 0 as no rule at
          all, so the worst a 0 can do is switch the rule off. */}
      <label>
        <span>Consistency (%)</span>
        <input
          type="number" step="0.1" value={v.consistency_pct}
          onChange={(e) => set('consistency_pct', e.target.value)}
          placeholder="none"
        />
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
  consistency_pct: numOrNull(v.consistency_pct),
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
  consistency_pct: a?.consistency_pct ?? '',
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
  /* consistency_pct is DELIBERATELY ABSENT, so applying a template leaves whatever the
     trader typed. templateToFields resolves only the rules the firm templates actually
     record, and not one of them carries a consistency cap — the numbers differ per firm
     AND per phase and we hold none of them. Listing it here would read
     `fields.consistency_pct ?? ''` and wipe a real cap on every template click, which
     is a silent loss of the one rule on this form that nothing else can restore. */
  firm_id: fields.firm_id ?? null,
  firm_name: fields.firm_name ?? null,
  product_id: fields.product_id ?? null,
});

// ---------------------------------------------------------------------------
// AccountEditModal — correct an existing account's label and its rules.
//
// IT NO LONGER ADDS. Creating an account is the Add Account wizard
// (/accounts/new), and it is the ONLY way: firm, product, size and phase are four
// decisions with dependencies between them, which is why the firm picked in this
// dialog's template strip was not even being saved before migration 0026. Three
// surfaces used to open this dialog in add mode — Settings > Accounts, Prop OS >
// Challenges, and the onboarding wizard's own duplicate form — and all three now
// navigate to the wizard.
//
// What stays: the template picker and the six rule fields, as a CORRECTION tool.
// A firm changes its drawdown, or a wizard answer was wrong, and this is where it
// is fixed. `kind` remains immutable after provisioning by design (see
// domain/accounts/accounts.js), so there is nothing add-time left to ask.
//
// GONE WITH THE ADD BRANCH, so a reader does not go looking for them: the kind
// radios and their Pro upsell (an add-time question), the eaAllowed gate that drove
// them, and the created/SetupCard second step. The EA setup card has two homes now —
// EaSetupModal below, reached from the accounts table, and the wizard's connect step
// at creation time.
// ---------------------------------------------------------------------------

export function AccountEditModal({ account = null, onClose, onSaved }) {
  const [label, setLabel] = useState(account?.label || '');
  const [v, setV] = useState(formFrom(account));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (f, val) => setV((p) => ({ ...p, [f]: val }));

  async function submit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await updateAccount(account.id, { label: label.trim(), ...toPayload(v) });
      onSaved?.();
      onClose?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="acct-form-modal" label="Edit Account">
      <div className="modal-head">
        <h3>Edit Account</h3>
        <button className="modal-x" onClick={onClose} aria-label="Close">&#10005;</button>
      </div>
      <form className="acct-form-body" onSubmit={submit}>
        <label className="acct-form-field">
          <span>Account name</span>
          <input
            placeholder="e.g. FTMO Challenge #1"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>

        {/* Picking a firm and a size pre-fills the six rule fields below, all still
            editable. Here it is a correction tool: choose the template the account
            should have been on and the fields catch up. */}
        <TemplatePicker onApply={(fields, suggested) => {
          setV((p) => applyTemplateToForm(p, fields));
          if (!label.trim() && suggested) setLabel(suggested);
        }} />
        <PropFields v={v} set={set} />
        {err && <div className="login-error">{err}</div>}

        <div className="acct-form-foot">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy || !label.trim()}>
            {busy ? 'Saving…' : 'Save Changes'}
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
