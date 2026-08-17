import React, { useEffect, useState } from 'react';
import { fmtDateTime, fmtNum, fmtDuration, slug, RULE_LABEL } from '../../lib/constants.js';
import { fmtMoney, tradeOutcome } from '../../lib/metrics.js';

// Small pencil / trash icons (inline SVG so no asset dependency).
const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6" /><path d="M14 11v6" />
  </svg>
);
const ReplayIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);

// A labeled value cell in the details grid. Renders "—" for empty values.
function Field({ label, children, wide }) {
  const empty = children == null || children === '';
  return (
    <div className={`tp-field ${wide ? 'wide' : ''}`}>
      <span className="tp-field-label">{label}</span>
      <span className="tp-field-value">{empty ? <span className="muted">—</span> : children}</span>
    </div>
  );
}

const Pill = ({ value, kind }) => (value ? <span className={`pill ${kind}-${slug(value)}`}>{value}</span> : null);

// Human labels for the rule types surfaced when a trade breaks its strategy.
const priceStr = (v) => (v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 5 }));

export default function TradePreview({ trade, unit = 'R', beRounding = false, onClose, onEdit, onDelete, onReplay }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset the delete affordance whenever the shown trade changes.
  useEffect(() => { setConfirmDelete(false); setDeleting(false); }, [trade?.id]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!trade) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [trade, onClose]);

  if (!trade) return null;

  const usd = unit === 'USD';
  const result = usd ? trade.pnl_money : trade.fixed_r;
  // Precision-aware outcome: a breakeven trade reads grey/"Breakeven" even if its
  // $ P&L is negative (the value itself is still shown as-is below).
  const out = tradeOutcome(trade, unit, beRounding);
  const tone = out || '';
  const outcome = out === 'win' ? 'Win' : out === 'loss' ? 'Loss' : out === 'be' ? 'Breakeven' : '—';
  const isLong = trade.direction === 'buy';
  const dir = trade.direction ? (isLong ? 'LONG' : 'SHORT') : null;
  const bigResult = usd
    ? fmtMoney(trade.pnl_money ?? 0, { sign: true })
    : (trade.fixed_r == null ? '—' : `${trade.fixed_r > 0 ? '+' : ''}${fmtNum(trade.fixed_r)}R`);

  async function doDelete() {
    setDeleting(true);
    try {
      await onDelete(trade.id);
      // On success the trade leaves the list and the panel unmounts on its own.
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="tp-backdrop" onClick={onClose}>
      <aside className="tp-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Trade preview">
        <header className="tp-header">
          <div className="tp-title">
            <button className="tp-close" onClick={onClose} title="Close">‹</button>
            <h2>{trade.symbol_base || trade.symbol}</h2>
            {dir && <span className={`tp-badge dir ${isLong ? 'long' : 'short'}`}>{dir}</span>}
            <span className="tp-badge closed">Closed</span>
            {result != null && <span className={`tp-badge outcome ${tone}`}>{outcome}</span>}
          </div>
          <div className="tp-actions">
            <button className="tp-icon-btn" title="Edit trade" onClick={() => onEdit(trade)}><EditIcon /></button>
            <button className="tp-icon-btn danger" title="Delete trade" onClick={() => setConfirmDelete(true)}><TrashIcon /></button>
          </div>
        </header>

        {/* Replay: chart playback of the trade. Only meaningful when the trade has
            real prices + a duration (EA/live trades) — imported/manual entries have
            nothing to chart. */}
        {onReplay && trade.entry_price != null && trade.exit_price != null &&
          new Date(trade.close_time) > new Date(trade.open_time) && (
          <button className="tp-replay-btn" onClick={() => onReplay(trade)}>
            <ReplayIcon /> Replay this trade
          </button>
        )}

        <div className="tp-subhead">
          Opened {fmtDateTime(trade.open_time)} · Closed {fmtDateTime(trade.close_time)}
          {fmtDuration(trade.open_time, trade.close_time) && <> · Held {fmtDuration(trade.open_time, trade.close_time)}</>}
        </div>

        {confirmDelete && (
          <div className="tp-delete-confirm">
            <span>Delete this trade? This can’t be undone.</span>
            <div className="tp-delete-actions">
              <button className="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button>
              <button className="danger" onClick={doDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes, delete'}</button>
            </div>
          </div>
        )}

        {/* Result card */}
        <div className={`tp-result ${tone}`}>
          <div className="tp-result-label">{usd ? 'NET P&L' : 'FIXED R'}</div>
          <div className="tp-result-value">{bigResult}</div>
          <div className="tp-result-sub">
            {usd
              ? <>Fixed R <b>{fmtNum(trade.fixed_r)}</b> · Max R <b>{fmtNum(trade.max_r)}</b></>
              : <>P&L <b>{trade.pnl_money == null ? '—' : fmtMoney(trade.pnl_money, { sign: true })}</b> · Max R <b>{fmtNum(trade.max_r)}</b></>}
          </div>
        </div>

        {/* Objective rule adherence — derived from this trade's mechanical fields
            against its strategy's rules (see adherence.js). */}
        {trade.adherence && (trade.adherence.status === 'followed' || trade.adherence.status === 'broken') && (
          <div className={`tp-adh ${trade.adherence.status}`}>
            <span className="tp-adh-icon">{trade.adherence.status === 'followed' ? '✓' : '⚠'}</span>
            <span>
              {trade.adherence.status === 'followed'
                ? <>Followed all <b>{trade.setup}</b> rules</>
                : <>Broke {trade.adherence.brokenRules.length} <b>{trade.setup}</b> rule{trade.adherence.brokenRules.length === 1 ? '' : 's'}: {trade.adherence.brokenRules.map((r) => RULE_LABEL[r] || r).join(', ')}</>}
            </span>
          </div>
        )}

        {/* All trade-log parameters */}
        <div className="tp-grid">
          <Field label="Type">{dir && <span className={`pill dir-${slug(trade.direction)}`}>{isLong ? 'Buy' : 'Sell'}</span>}</Field>
          <Field label="Session"><Pill value={trade.session} kind="session" /></Field>
          <Field label="Pair"><Pill value={trade.symbol_base || trade.symbol} kind="pair" /></Field>
          <Field label="Setup"><Pill value={trade.setup} kind="setup" /></Field>
          <Field label="Probability"><Pill value={trade.probability} kind="prob" /></Field>
          <Field label="MTF Phase"><Pill value={trade.mtf_phase} kind="mtf" /></Field>
          <Field label="SL Size (pips)">{fmtNum(trade.sl_size_pips, 1)}</Field>
          <Field label="MFE (pips)">{fmtNum(trade.mfe_pips, 1)}</Field>
          <Field label="Max R">{fmtNum(trade.max_r)}</Field>
          <Field label="Fixed R">{fmtNum(trade.fixed_r)}</Field>
          <Field label="Net P&L">{trade.pnl_money == null ? '' : fmtMoney(trade.pnl_money, { sign: true })}</Field>
          <Field label="Commission">{trade.commission == null ? '' : fmtMoney(trade.commission, { sign: true })}</Field>
          <Field label="Volume">{trade.volume == null ? '' : fmtNum(trade.volume, 2)}</Field>
          <Field label="Entry">{priceStr(trade.entry_price)}</Field>
          <Field label="Exit">{priceStr(trade.exit_price)}</Field>
          <Field label="Stop Loss">{priceStr(trade.sl_price)}</Field>
          <Field label="Take Profit">{priceStr(trade.tp_price)}</Field>
          <Field label="Broker Symbol">{trade.symbol}</Field>
          <Field label="Source">{trade.source}</Field>
          <Field label="MT5 Ticket">{trade.mt5_ticket}</Field>
        </div>

        {/* Chart links */}
        {(trade.m15_url || trade.h1_url || trade.h4_url) && (
          <div className="tp-charts">
            <span className="tp-section-title">Charts</span>
            <div className="tp-chart-links">
              {[['M15', trade.m15_url], ['H1', trade.h1_url], ['H4', trade.h4_url]].map(([lbl, url]) => (
                url ? <a key={lbl} href={url} target="_blank" rel="noreferrer" className="chart-link">{lbl}</a> : null
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="tp-notes">
          <span className="tp-section-title">Notes</span>
          {trade.comments ? <p>{trade.comments}</p> : <p className="muted">No notes for this trade.</p>}
        </div>
      </aside>
    </div>
  );
}
