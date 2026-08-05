import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';
import {
  Button, Menu, MenuCheckboxItem, MenuContent, MenuSeparator, MenuTrigger, Modal,
  ToggleGroupExclusive, ToggleGroupItem,
} from '@/components/primitives';
import { fmtMoney, fmtVal, tradeOutcome, valueField } from './metrics.js';
import {
  MTF_OPTIONS, PROBABILITY_OPTIONS, RULE_LABEL, fmtNum, fmtTime, slug, titleCase,
} from './constants.js';
import { dayTitle, fmtMins, holdMinutes } from './dayStats.js';

// The Journal workspace — one trading day, reviewed in one screen.
//
// WHAT THIS REPLACED, AND WHY. The old "+ Journal" modal was a 620px column of
// textareas: every trade of the day stacked vertically with a two-row note box
// each, and nothing else. It answered "write a note" and nothing more, so
// journalling a trade properly — reading its numbers, setting its strategy,
// checking the chart you screenshotted — meant closing it, opening the trade
// preview, opening the edit modal, and losing your place in the day.
//
// This is a master–detail workspace instead, which is the shape the review
// actually has: the day is the container, one trade is the subject, and the
// subject changes without anything else moving.
//
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ ‹ Wednesday, 22 Jul 2026 ›     Journal      [Filter]         ✕   │
//   ├──────────┬───────────────────────────┬───────────────────────────┤
//   │ Today's  │  Trade details, and the   │  Screenshots              │
//   │ Trades   │  fields you tag it with   ├───────────────────────────┤
//   │  XAUUSD  │  (strategy, probability,  │  Account                  │
//   │  EURUSD  │  MTF phase, SL, MFE)      │                           │
//   │          ├───────────────────────────┴───────────────────────────┤
//   │          │  Trade note            │  Day review                  │
//   └──────────┴────────────────────────┴──────────────────────────────┘
//
// THE LEFT RAIL DRIVES THE CENTRE ON CLICK, NOT ON HOVER. The sketch this was
// built from annotates the rail "imagine hovering — the centre panel instantly
// updates", and the instant part is honoured: selection is local state, so there
// is no fetch, no spinner and no transition. Pointer-hover selection is the part
// deliberately not implemented, because the centre panel holds EDITABLE fields:
// sweeping the mouse across the rail on the way to the Save button would swap the
// form out from under half-typed input. Click keeps the immediacy and loses the
// trap.
//
// TWO NOTES, BECAUSE THEY ARE TWO DIFFERENT THOUGHTS. "I chased the entry" belongs
// to a trade; "I overtraded after the first loss" belongs to the session. The left
// pane writes `trades.comments` — the same field the trade log's Notes column and
// the preview panel read, so this is a faster route into data that already works.
// The right pane writes the day note (`day_notes`, added for this), which had
// nowhere to live before and would otherwise have been duplicated across every
// trade of the day.
//
// NOTHING SAVES UNTIL SAVE. Every edit lands in `draft`, and only what actually
// differs from what is stored is sent — saving all of it every time would mark
// untouched trades tagged and bump their updated_at for no reason. That rule
// carried over from the old modal; what is new is that it now covers nine fields
// per trade plus the day note rather than one field per trade.
//
// THE DATE STEPS, AND THAT IS NOT THE OLD STEPPER COMING BACK. DayView deleted a
// prev/next stepper when it became a feed, and the reason it was wrong there holds:
// as a way to FIND a day, arrows make you click through days you didn't want. This
// is the other job — you have just finished reviewing Wednesday and want Tuesday,
// and the feed route means closing the workspace, scrolling to the next card and
// finding its Journal button. The steps move between days that are ADJACENT IN THE
// FEED, filters and all, so they never land on a day the page itself wouldn't show.
//
// Stepping needs a guard the feed route doesn't, because drafts are keyed on the day
// (see `initial`): walking to Tuesday discards what is typed on Wednesday. So a step
// with unsaved changes ARMS instead of moving, and says what a second press costs.
// A confirm dialog was the alternative and is worse — a modal over a modal to
// protect a note, and the arrow is right there when you press again. Save is not
// offered as the way out of the guard because Save closes the workspace: this is
// "leave without saving", which is what Cancel already is, made explicit.

// The fields this workspace may write on a trade. Same set as the Edit-trade modal
// (TagModal), which is the point: two ways in, one vocabulary, no third opinion
// about what a trade's discretionary fields are.
const TAG_FIELDS = ['setup', 'probability', 'mtf_phase'];
const SHOT_FIELDS = ['m15_url', 'h1_url', 'h4_url'];
const METRIC_FIELDS = ['sl_size_pips', 'mfe_pips'];
const EDITABLE = [...TAG_FIELDS, ...SHOT_FIELDS, ...METRIC_FIELDS, 'comments'];

// Timeframes, in the order a top-down read goes. `key` is the field prefix.
const SHOTS = [['h4', 'H4'], ['h1', 'H1'], ['m15', 'M15']];

// Outcome facets for the Filter menu. Checkbox semantics are correct here and
// radio semantics would not be: these are additive, and none checked means all.
const OUTCOMES = [['win', 'Winners'], ['loss', 'Losers'], ['be', 'Breakeven']];

// Draft values are strings, because every one of them is bound to an input. `null`
// and a number both have to become '' / '0.8' or React switches the field between
// controlled and uncontrolled.
const str = (v) => (v == null ? '' : String(v));
const draftOf = (t) => Object.fromEntries(EDITABLE.map((k) => [k, str(t[k])]));

const sign = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const priceStr = (v) => (v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 5 }));

// A labelled read-only figure. Renders an em dash for absent data, which is what a
// dash means — see DESIGN-LANGUAGE §3 (a break-even is written BE, not as a dash).
function Fact({ label, children, tone }) {
  const empty = children == null || children === '';
  return (
    <div className="djw-fact">
      <span className="djw-fact-label">{label}</span>
      <span className={`djw-fact-value ${tone || ''}`}>
        {empty ? <span className="muted">—</span> : children}
      </span>
    </div>
  );
}

const Pill = ({ value, kind }) => (value ? <span className={`pill ${kind}-${slug(value)}`}>{value}</span> : null);

// One row of the left rail. The result is the thing you scan for, so it sits at the
// end of the row where a column of them lines up.
function RailRow({ trade, unit, beRounding, note, selected, onSelect }) {
  const out = tradeOutcome(trade, unit, beRounding);
  const field = valueField(unit);
  return (
    <button
      type="button"
      className={`djw-rail-row ${selected ? 'is-sel' : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(trade.id)}
    >
      <span className="djw-rail-top">
        <span className={`pill pair-${slug(trade.symbol_base || trade.symbol)}`}>
          {trade.symbol_base || trade.symbol}
        </span>
        <span className={`djw-rail-val ${out === 'win' ? 'pos' : out === 'loss' ? 'neg' : ''}`}>
          {fmtVal(trade[field], unit)}
        </span>
      </span>
      <span className="djw-rail-sub">
        <span className="djw-rail-time">{fmtTime(trade.close_time)}</span>
        {trade.direction && <span className="djw-rail-dir">{trade.direction === 'sell' ? 'Sell' : 'Buy'}</span>}
        {/* A dot, not the word "note": the rail is a scan surface, and this only has
            to answer "written or not". Titled so the meaning is available. */}
        <span
          className={`djw-rail-dot ${note ? 'is-on' : ''}`}
          title={note ? 'Has a note' : 'No note yet'}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

// One arrow of the date stepper. `disabled` is only ever about whether a day EXISTS
// in that direction (or a save being in flight) — the unsaved-changes guard leaves
// the button live on purpose, because Chrome fires no pointer events on a disabled
// control, so a disabled arrow could neither show its title nor take the second
// press that the guard is asking for.
function DayStep({ target, dir, disabled, armed, onStep }) {
  const name = dir === 'prev' ? 'Previous day' : 'Next day';
  const label = target ? `${name}: ${dayTitle(target.key)}` : `${name} — none in this view`;
  return (
    <Button
      variant="chrome"
      size="icon-sm"
      onClick={() => onStep(target)}
      disabled={disabled || !target}
      active={armed}
      title={label}
      aria-label={label}
    >
      {dir === 'prev' ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </Button>
  );
}

export default function DayJournalWorkspace({
  day, unit = 'R', beRounding = false, strategies = [], accounts = [],
  dayNote = '', prevDay = null, nextDay = null, onPickDay,
  onClose, onSaveTrade, onSaveDayNote,
}) {
  const field = valueField(unit);
  const trades = day?.trades || [];

  // Drafts for every trade of the day, seeded from what is stored. Keyed on the DAY
  // rather than on `trades`, so a socket update or a save re-render does not wipe
  // what is being typed.
  const initial = useMemo(
    () => Object.fromEntries(trades.map((t) => [t.id, draftOf(t)])),
    [day?.key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [draft, setDraft] = useState(initial);
  const [noteDraft, setNoteDraft] = useState(dayNote);
  // Has the user typed in the Day Review box yet? This exists for a race, not for
  // tidiness: DayView fetches the day notes asynchronously, so `dayNote` can arrive
  // AFTER the workspace is already open. Seeding it once would then leave an empty
  // box beside a stored note — which reads as "nothing written", counts as a pending
  // change, and on Save would overwrite the real note with ''. So the prop keeps
  // seeding the box until the moment the user owns it.
  const [noteTouched, setNoteTouched] = useState(false);
  const [selId, setSelId] = useState(() => trades[0]?.id ?? null);
  const [shot, setShot] = useState('h4');
  const [facets, setFacets] = useState(() => new Set());
  // URLs whose image failed to load. Kept per URL rather than per timeframe so
  // correcting a typo re-tries instead of staying broken until reopen.
  const [broken, setBroken] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // The day key a step is armed for, or null. Per-target rather than a bare boolean,
  // so arming "previous" and then pressing "next" asks again instead of stepping the
  // way you didn't confirm.
  const [armed, setArmed] = useState(null);
  // Where the focus trap should land on open. Left to Base UI's default it goes to
  // the first tabbable element, which is the Filter button — so opening the Journal
  // put a focus ring on a control nobody came here to press, and on a segmented
  // control a ring reads as a selection. The note is what the button promised.
  const noteRef = useRef(null);

  // Opening a different day is a different session: re-seed everything.
  useEffect(() => {
    setDraft(initial);
    setNoteDraft(dayNote);
    setNoteTouched(false);
    setSelId(trades[0]?.id ?? null);
    setFacets(new Set());
    setError(null);
    setArmed(null);
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing disarms. Otherwise a step armed before a paragraph was written would still
  // be armed after it, and the second press — made minutes later, about work the user
  // has since added to — would discard more than they were warned about.
  useEffect(() => { setArmed(null); }, [draft, noteDraft]);

  // The late-arriving half of the same rule — see `noteTouched` above.
  useEffect(() => {
    if (!noteTouched) setNoteDraft(dayNote);
  }, [dayNote, noteTouched]);

  // Land on the highest timeframe that actually has a chart for this trade, so
  // selecting a trade shows a screenshot rather than an empty tab you have to hunt
  // past. Deliberately NOT re-run as `draft` changes — re-picking the tab while a
  // URL is being pasted would move it out from under the caret.
  useEffect(() => {
    if (selId == null) return;
    const d = draft[selId] || {};
    setShot(SHOTS.find(([k]) => d[`${k}_url`])?.[0] || 'h4');
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!day) return null;

  const sel = trades.find((t) => t.id === selId) || null;
  const selDraft = (selId != null && draft[selId]) || {};
  const set = (k) => (e) => setDraft((d) => ({ ...d, [selId]: { ...d[selId], [k]: e.target.value } }));

  // ---- filter -------------------------------------------------------------
  const wanted = new Set(OUTCOMES.map(([k]) => k).filter((k) => facets.has(k)));
  const rows = trades.filter((t) => {
    if (wanted.size && !wanted.has(tradeOutcome(t, unit, beRounding))) return false;
    if (facets.has('unwritten') && (draft[t.id]?.comments || '').trim()) return false;
    return true;
  });
  const toggleFacet = (k) => setFacets((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  // The selected trade stays selected even when the filter hides it. Yanking the
  // centre panel away because a filter changed would discard edits in progress —
  // a filter narrows what you can REACH, not what you are working on.

  // ---- what's unsaved -----------------------------------------------------
  const changedOn = (t) => EDITABLE.filter((k) => (draft[t.id]?.[k] ?? '') !== str(t[k]));
  const dirtyTrades = trades.filter((t) => changedOn(t).length > 0);
  const noteDirty = noteDraft.trim() !== (dayNote || '').trim();
  const pending = dirtyTrades.length + (noteDirty ? 1 : 0);

  // ---- stepping to the day either side --------------------------------------
  function step(target) {
    if (!target || saving) return;
    if (pending > 0 && armed !== target.key) { setArmed(target.key); return; }
    onPickDay(target);
  }

  async function save() {
    if (!pending) { onClose(); return; }
    setSaving(true);
    setError(null);

    const jobs = dirtyTrades.map((t) => {
      // Only the keys that moved. The trade PATCH merges metric fields with what is
      // stored and re-derives Max R / Fixed R from the merge, so sending one of the
      // pair is safe — and sending an unchanged field would re-derive R for a note
      // edit, which is not what the user asked for.
      const payload = {};
      for (const k of changedOn(t)) {
        const v = draft[t.id][k];
        payload[k] = v === '' ? null : (METRIC_FIELDS.includes(k) ? Number(v) : v.trim());
      }
      return onSaveTrade(t.id, payload);
    });
    if (noteDirty) jobs.push(onSaveDayNote(day.key, noteDraft.trim()));

    // allSettled, so one failure does not discard the writes that succeeded — and
    // the user is told how many did not land rather than the modal just staying open.
    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === 'rejected').length;
    setSaving(false);
    if (failed) setError(`${failed} of ${jobs.length} changes didn't save. The rest were kept.`);
    else onClose();
  }

  // ---- the selected trade's derived figures -------------------------------
  const out = sel ? tradeOutcome(sel, unit, beRounding) : null;
  const sl = Number(selDraft.sl_size_pips);
  const mfe = Number(selDraft.mfe_pips);
  const maxR = selDraft.sl_size_pips !== '' && selDraft.mfe_pips !== '' && sl > 0
    ? (Math.round((mfe / sl) * 100) / 100).toFixed(2)
    : '';
  // Fixed R scales inversely with SL size — the realized reward in pips is fixed,
  // only the risk denominator moves. Previewed here for price-derived trades the
  // same way the Edit-trade modal previews it; the backend recomputes the same.
  const canScale = sel && sel.source !== 'manual' && sel.fixed_r != null && Number(sel.sl_size_pips) > 0;
  const fixedR = canScale && sl > 0
    ? Math.round((Number(sel.fixed_r) * Number(sel.sl_size_pips) / sl) * 100) / 100
    : sel?.fixed_r;

  // Keep the trade's own strategy selectable even if it was since archived, so
  // saving cannot silently drop it.
  const names = strategies.map((s) => s.name);
  const setups = selDraft.setup && !names.includes(selDraft.setup) ? [selDraft.setup, ...names] : names;

  const acct = sel ? accounts.find((a) => String(a.mt5_login) === String(sel.account_id)) : null;
  // Manual accounts carry a synthetic negative login (see migration 0015) — a
  // number that is an implementation detail, not something to show a user.
  const login = Number(acct?.mt5_login) > 0 ? acct.mt5_login : null;

  const shotUrl = selDraft[`${shot}_url`] || '';
  const shotBroken = broken.has(shotUrl);

  return (
    <Modal
      onClose={() => !saving && onClose()}
      className="djw-modal"
      label={`Journal for ${dayTitle(day.key)}`}
      initialFocus={noteRef}
    >
      {/* Three slots, matching the sketch: the date and its steps own the left, the
          workspace names itself in the middle, the controls sit right. */}
      <header className="djw-head">
        {/* The date, and a step either side of it. Newest-first is the feed's order,
            so the older day sits on the left where "previous" reads. */}
        <div className="djw-nav">
          <DayStep
            dir="prev"
            target={prevDay}
            disabled={saving}
            armed={!!prevDay && armed === prevDay.key}
            onStep={step}
          />
          <span className="djw-date">{dayTitle(day.key)}</span>
          <DayStep
            dir="next"
            target={nextDay}
            disabled={saving}
            armed={!!nextDay && armed === nextDay.key}
            onStep={step}
          />
        </div>
        <h2 className="djw-title">Journal</h2>
        <div className="djw-head-actions">
          <Menu>
            <MenuTrigger render={<Button variant="chrome" size="sm" active={facets.size > 0} />}>
              <Filter aria-hidden="true" data-icon="inline-start" />
              Filter
              {facets.size > 0 && <span className="djw-filter-count">{facets.size}</span>}
              <ChevronDown aria-hidden="true" data-icon="inline-end" />
            </MenuTrigger>
            <MenuContent className="djw-filter-menu">
              {OUTCOMES.map(([key, label]) => (
                <MenuCheckboxItem
                  key={key}
                  checked={facets.has(key)}
                  onCheckedChange={() => toggleFacet(key)}
                >
                  {label}
                </MenuCheckboxItem>
              ))}
              <MenuSeparator />
              <MenuCheckboxItem
                checked={facets.has('unwritten')}
                onCheckedChange={() => toggleFacet('unwritten')}
              >
                Needs a note
              </MenuCheckboxItem>
            </MenuContent>
          </Menu>
          <Button
            variant="chrome"
            size="icon-sm"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            {/* A lucide glyph rather than a `✕` character: a text glyph inherits the
                control's font metrics and lands at a different size in every
                typeface, where an icon is sized by the button. */}
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="djw-body">
        {/* ---- left rail: the day's trades ---- */}
        <section className="djw-panel djw-rail" aria-label="Today's trades">
          <div className="djw-panel-head">
            <h3 className="djw-panel-title">Today's Trades</h3>
            <span className="djw-panel-meta">{rows.length} of {trades.length}</span>
          </div>
          <div className="djw-rail-list">
            {rows.length === 0 ? (
              <p className="djw-empty">
                {trades.length === 0 ? 'No trades on this day.' : 'No trades match the filter.'}
              </p>
            ) : rows.map((t) => (
              <RailRow
                key={t.id}
                trade={t}
                unit={unit}
                beRounding={beRounding}
                note={(draft[t.id]?.comments || '').trim()}
                selected={t.id === selId}
                onSelect={setSelId}
              />
            ))}
          </div>
          {/* The day's own line, under its trades — the container's result, so the
              rail answers "how did the session go" as well as "what did I take". */}
          <div className="djw-rail-foot">
            <span className="djw-panel-meta">Day net</span>
            <span className={`djw-rail-net ${sign(day.stats.net)}`}>{fmtVal(day.stats.net, unit)}</span>
          </div>
        </section>

        {/* ---- centre: the selected trade ---- */}
        <section className="djw-panel djw-detail" aria-label="Trade details">
          {!sel ? (
            <p className="djw-empty">Select a trade to journal it.</p>
          ) : (
            <>
              <div className="djw-panel-head">
                <div className="djw-detail-id">
                  <span className={`pill pair-${slug(sel.symbol_base || sel.symbol)}`}>
                    {sel.symbol_base || sel.symbol}
                  </span>
                  {sel.direction && (
                    <span className={`pill dir-${slug(sel.direction)}`}>
                      {sel.direction === 'sell' ? 'Sell' : 'Buy'}
                    </span>
                  )}
                  <Pill value={sel.session} kind="session" />
                  <span className="djw-detail-time">{fmtTime(sel.close_time)}</span>
                </div>
                <span className={`djw-detail-net ${out === 'win' ? 'pos' : out === 'loss' ? 'neg' : ''}`}>
                  {fmtVal(sel[field], unit)}
                </span>
              </div>

              <div className="djw-detail-scroll">
                {/* Objective rule adherence, derived from the trade's mechanical
                    fields against its strategy's rules — the same line the trade
                    preview shows, because it is the same fact. */}
                {sel.adherence && (sel.adherence.status === 'followed' || sel.adherence.status === 'broken') && (
                  <div className={`djw-adh ${sel.adherence.status}`}>
                    <span className="djw-adh-icon" aria-hidden="true">
                      {sel.adherence.status === 'followed' ? '✓' : '⚠'}
                    </span>
                    <span>
                      {sel.adherence.status === 'followed'
                        ? <>Followed all <b>{sel.setup}</b> rules</>
                        : <>Broke {sel.adherence.brokenRules.length} <b>{sel.setup}</b> rule{sel.adherence.brokenRules.length === 1 ? '' : 's'}: {sel.adherence.brokenRules.map((r) => RULE_LABEL[r] || r).join(', ')}</>}
                    </span>
                  </div>
                )}

                <h4 className="djw-group-title">Tags</h4>
                <div className="djw-fields">
                  <label className="djw-field">
                    <span className="djw-field-label">Strategy</span>
                    <select value={selDraft.setup} onChange={set('setup')}>
                      <option value="">—</option>
                      {setups.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                  <label className="djw-field">
                    <span className="djw-field-label">Probability</span>
                    <select value={selDraft.probability} onChange={set('probability')}>
                      <option value="">—</option>
                      {PROBABILITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                  <label className="djw-field">
                    <span className="djw-field-label">MTF Phase</span>
                    <select value={selDraft.mtf_phase} onChange={set('mtf_phase')}>
                      <option value="">—</option>
                      {MTF_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                </div>

                <h4 className="djw-group-title">Risk</h4>
                <div className="djw-fields">
                  <label className="djw-field">
                    <span className="djw-field-label">SL Size (pips)</span>
                    <input type="number" min="0" step="0.1" value={selDraft.sl_size_pips} onChange={set('sl_size_pips')} placeholder="—" />
                  </label>
                  <label className="djw-field">
                    <span className="djw-field-label">MFE (pips)</span>
                    <input type="number" min="0" step="0.1" value={selDraft.mfe_pips} onChange={set('mfe_pips')} placeholder="—" />
                  </label>
                  {/* Both derive from the pair above, so they are shown rather than
                      typed — and shown live, so the cost of correcting an SL is
                      visible before saving. */}
                  <div className="djw-field">
                    <span className="djw-field-label">Max R</span>
                    <span className="djw-derived">{maxR || '—'}</span>
                  </div>
                  <div className="djw-field">
                    <span className="djw-field-label">Fixed R</span>
                    <span className={`djw-derived ${sign(fixedR)}`}>{fmtNum(fixedR)}</span>
                  </div>
                </div>

                <h4 className="djw-group-title">Execution</h4>
                <div className="djw-facts">
                  <Fact label="Entry">{priceStr(sel.entry_price)}</Fact>
                  <Fact label="Exit">{priceStr(sel.exit_price)}</Fact>
                  <Fact label="Stop Loss">{priceStr(sel.sl_price)}</Fact>
                  <Fact label="Take Profit">{priceStr(sel.tp_price)}</Fact>
                  <Fact label="Volume">{sel.volume == null ? '' : fmtNum(sel.volume, 2)}</Fact>
                  <Fact label="Held">{fmtMins(holdMinutes(sel))}</Fact>
                  <Fact label="Net P&L" tone={sign(sel.pnl_money)}>
                    {sel.pnl_money == null ? '' : fmtMoney(sel.pnl_money, { sign: true })}
                  </Fact>
                  <Fact label="Commission">
                    {sel.commission == null ? '' : fmtMoney(sel.commission, { sign: true })}
                  </Fact>
                  {/* Source and ticket are facts about the TRADE, not about the
                      account it sits in — they belong in this group, and keeping the
                      Account panel to the account is what leaves the chart frame
                      enough height to show a chart. */}
                  <Fact label="Source">{titleCase(sel.source)}</Fact>
                  <Fact label="MT5 Ticket">{sel.mt5_ticket}</Fact>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ---- right: screenshots over the account ---- */}
        <div className="djw-side">
          <section className="djw-panel djw-shots" aria-label="Screenshots">
            <div className="djw-panel-head">
              <h3 className="djw-panel-title">Screenshots</h3>
              <ToggleGroupExclusive
                value={shot}
                onValueChange={setShot}
                className="djw-shot-tabs"
                aria-label="Timeframe"
              >
                {SHOTS.map(([key, label]) => (
                  <ToggleGroupItem key={key} value={key} aria-label={label}>
                    {label}
                    {/* A filled dot beside a timeframe that HAS a chart, so the two
                        empty tabs are identifiable without clicking through them. */}
                    {(selDraft[`${key}_url`] || '') && <span className="djw-shot-dot" aria-hidden="true" />}
                  </ToggleGroupItem>
                ))}
              </ToggleGroupExclusive>
            </div>

            <div className="djw-shot-frame">
              {!sel ? (
                <p className="djw-empty">No trade selected.</p>
              ) : !shotUrl ? (
                <p className="djw-empty">No {SHOTS.find(([k]) => k === shot)?.[1]} chart linked yet. Paste a link below.</p>
              ) : shotBroken ? (
                // Not every chart link is an image — a TradingView permalink is a
                // page. Rather than show a broken frame, offer the thing that does
                // work.
                <a className="djw-shot-link" href={shotUrl} target="_blank" rel="noreferrer">
                  Open this chart in a new tab
                </a>
              ) : (
                <a href={shotUrl} target="_blank" rel="noreferrer" className="djw-shot-img-link">
                  <img
                    className="djw-shot-img"
                    src={shotUrl}
                    alt={`${SHOTS.find(([k]) => k === shot)?.[1]} chart for this trade`}
                    onError={() => setBroken((prev) => new Set(prev).add(shotUrl))}
                  />
                </a>
              )}
            </div>

            {/* No label above this input: the pressed tab already names the
                timeframe, and a second statement of it costs the frame ~18px of the
                height it needs to show a chart. The placeholder carries it. */}
            {sel && (
              <div className="djw-field djw-shot-input">
                <input
                  value={shotUrl}
                  onChange={set(`${shot}_url`)}
                  aria-label={`${SHOTS.find(([k]) => k === shot)?.[1]} chart link`}
                  placeholder={`Paste an ${SHOTS.find(([k]) => k === shot)?.[1]} chart link…`}
                />
              </div>
            )}
          </section>

          <section className="djw-panel djw-acct" aria-label="Account">
            <div className="djw-panel-head">
              <h3 className="djw-panel-title">Account</h3>
            </div>
            <div className="djw-acct-body">
              <span className="djw-acct-name">{acct?.label || 'Unassigned'}</span>
              <div className="djw-facts">
                <Fact label="Login">{login}</Fact>
                <Fact label="Type">{acct?.kind === 'manual' ? 'Manual' : titleCase(acct?.account_type)}</Fact>
              </div>
            </div>
          </section>
        </div>

        {/* ---- bottom: the two notes ---- */}
        <div className="djw-notes">
          <section className="djw-panel djw-note-pane" aria-label="Trade note">
            <div className="djw-panel-head">
              <h3 className="djw-panel-title">Notes</h3>
              <span className="djw-panel-meta">
                {sel ? `${sel.symbol_base || sel.symbol} · ${fmtTime(sel.close_time)}` : '—'}
              </span>
            </div>
            {/* The textarea keeps its own border and the shared focus ring rather
                than bleeding to the panel's edge — a full-bleed field's ring would
                be clipped by the panel's overflow, and a note field with no visible
                focus is N8. */}
            <div className="djw-note-wrap">
              <textarea
                ref={noteRef}
                className="djw-note"
                value={selDraft.comments ?? ''}
                onChange={set('comments')}
                disabled={!sel}
                placeholder="What did you see? What would you repeat or avoid?"
              />
            </div>
          </section>

          <section className="djw-panel djw-note-pane" aria-label="Day review">
            <div className="djw-panel-head">
              <h3 className="djw-panel-title">Day Review</h3>
              <span className="djw-panel-meta">{day.stats.trades} trade{day.stats.trades === 1 ? '' : 's'}</span>
            </div>
            <div className="djw-note-wrap">
              <textarea
                className="djw-note"
                value={noteDraft}
                onChange={(e) => { setNoteTouched(true); setNoteDraft(e.target.value); }}
                placeholder="How did the session go? What would you do differently tomorrow?"
              />
            </div>
          </section>
        </div>
      </div>

      <footer className="djw-foot">
        {error && <span className="djw-error" role="alert">{error}</span>}
        {/* The armed warning takes the status slot rather than appearing beside the
            arrow it belongs to: this line is where "N changes to save" already is, so
            it is the line the user reads for the state of their work. */}
        {!error && armed && (
          <span className="djw-status is-warn" role="status">
            {pending} unsaved change{pending === 1 ? '' : 's'} — press again to leave this day
          </span>
        )}
        {!error && !armed && (
          <span className="djw-status">
            {pending === 0
              ? 'No changes yet'
              : `${pending} change${pending === 1 ? '' : 's'} to save`}
          </span>
        )}
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving || pending === 0}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </footer>
    </Modal>
  );
}
