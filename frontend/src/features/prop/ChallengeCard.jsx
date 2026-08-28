import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Badge, Button, Card } from '@/components/primitives';
import { settlePhase } from '../../lib/api.js';
import { fmtMoney } from '../../lib/metrics.js';
import { healthStatus, roomStatus } from './PropOS.jsx';
import { MiniMeter } from './AccountPortfolioCard.jsx';
import { LifecycleRail } from './ChallengeLifecycle.jsx';

// ---------------------------------------------------------------------------
// Challenge card — ONE CHALLENGE, which since migration 0027 is one challenge_groups
// row and the N accounts that are its phases.
//
// WHAT CHANGED, AND WHY THE CARD HAD TO. It used to be one card per ACCOUNT, because a
// challenge WAS an account: /api/prop/advance walked a single login from p1 to p2 to
// funded. A prop firm does not work that way — passing Phase 1 gets the trader a new
// login — so a two-phase challenge drew as two unrelated cards, each with its own rail
// claiming to be a whole journey. Now the rail spans the challenge and each stop is one
// of its accounts.
//
// WHAT SEPARATES IT FROM THE ACCOUNTS CARD, since the two still show the same accounts.
// `AccountPortfolioCard` answers "which of my accounts needs me now?" and leads with
// three drawdown/target meters. This answers "how is this challenge progressing toward
// funding?", so it leads with WHERE ON THE JOURNEY the challenge is — and now lets the
// trader walk it, because the phases are on different accounts and the rail is the only
// control that can move between them.
//
// THE RAIL IS THE CARD'S NAVIGATION (owner spec 2026-08-27). Clicking an eligible stop
// swaps the panel under it: a phase with an account shows that account's figures, and
// the phase the firm has just issued shows the button that records it. Only eligible
// stops are buttons — a phase that neither exists nor can be created yet has nothing
// behind it, and `groupLifecycle` decides which is which.
//
// THE PANEL'S FIGURES ARE THE ENGINE'S, per phase. Each stop carries its own account's
// challengeState, so the meters belong to the phase on screen rather than to whichever
// account happened to be live. A PASSED phase has no state at all — passing closes its
// challenge row, which is what removes it from the engine — so it reports what the
// account row knows and does not invent a final equity nobody stored.
//
// THE MANUAL OVERRIDE LIVES HERE TOO (owner decision 2026-08-27), on the phase panel,
// because this is the page a trader is looking at when the automatic settlement does not
// fire — and the button that existed before was on the OVERVIEW's accounts card, three
// clicks away from the rail that shows the phase it acts on.
//
// It calls `settlePhase`, NOT `advanceChallenge`: the second closes the phase and opens
// the next one on the SAME account, which under the multi-account model invents a Phase 2
// on the Phase 1 login and swallows the invitation to add the real one. And it works both
// ways — a phase settled by mistake (or by a stale EA balance) can be reopened, which is
// the undo an automatic system has to have.
//
// AND IT REUSES EVERYTHING ELSE: the meter is `MiniMeter` from the accounts card, the
// rail is `LifecycleRail` from the Details lifecycle, the thresholds are the shared
// `roomStatus` / `healthStatus`, and the frame is the `.pa-card*` / `.pc-*` rules that
// already exist for a card of this shape.
// ---------------------------------------------------------------------------

const money = (n) => (n == null ? '—' : fmtMoney(n));
const pct1 = (f) => `${((f || 0) * 100).toFixed(1)}%`;
const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// Status is a WORD first; colour only reinforces it.
const HEALTH_LABEL = { good: 'On Track', warn: 'At Risk', bad: 'Critical', na: 'No Data' };

/* The challenge's own badge: what became of the whole journey, which is a different fact
 * from what became of any one phase. A failed group is failed however well its Phase 1
 * went. */
const GROUP_BADGE = {
  failed: { tone: 'loss', label: 'Failed' },
  passed: { tone: 'profit', label: 'Complete' },
  active: { tone: 'neutral', label: 'Active' },
};

/** The figures for the phase on screen. A phase with no live state (passed, or not yet
 *  added) has no equity: the engine only computes the ACTIVE challenge, so a closed
 *  phase reports its capital and nothing else rather than a number nobody recorded. */
function phaseFigures(stage) {
  const state = stage?.state ?? null;
  const capital = state?.startBalance ?? stage?.account?.start_balance ?? null;
  const balance = state?.currentEquity ?? null;
  const pnl = balance != null && capital != null ? Math.round((balance - capital) * 100) / 100 : null;
  return { capital, balance, pnl };
}

export default function ChallengeCard({
  row, stages, selected, onSelectPhase, onOpenAccount, onChanged,
}) {
  const stage = stages.find((s) => s.id === selected) || null;
  const state = stage?.state ?? null;
  const breached = stage?.status === 'breached';
  const health = healthStatus(state?.health?.score ?? 0, breached);
  const maxSt = roomStatus(state?.maxDd?.fracRemaining, state?.maxDd?.breached);

  /* THE RAIL'S TONE BELONGS TO THE PHASE BEING TRADED, not to the phase being LOOKED AT,
   * and that distinction was a real bug: the rail lights its active stop with
   * `activeTone`, so passing the selected phase's health drew the live Phase 2 node RED
   * the moment the trader clicked back to their passed Phase 1 — a passed phase has no
   * engine state, `healthStatus(0)` is 'bad', and the card reported a healthy challenge as
   * critical. Caught in a screenshot, not by a test, which is why the rail's tone is now
   * computed from the active stage's OWN state. 'na' where there is no live phase at all
   * (every phase passed, or none added), because grey is "we do not know" and red is a
   * claim. */
  const live = stages.find((s) => s.status === 'active') || null;
  const railTone = live?.state
    ? healthStatus(live.state.health?.score ?? 0, live.state.breach?.breached)
    : 'na';

  const maxUsed = state?.maxDd ? state.maxDd.limit - state.maxDd.roomLeft : null;
  const maxPct = state?.maxDd?.limit ? maxUsed / state.maxDd.limit : 0;
  const target = state?.profitTarget ?? null;
  const { capital, pnl } = phaseFigures(stage);
  const badge = GROUP_BADGE[row.status] ?? GROUP_BADGE.active;

  /* The override's own state, per card. `err` is rendered rather than swallowed: the one
   * failure this call has is a 409 ("already settled"), which happens when another tab —
   * or the engine, between renders — got there first, and that is a sentence the trader
   * needs to read rather than a button that appears to do nothing. */
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(null);
  const settle = async (status) => {
    setBusy(status);
    setErr(null);
    try {
      await settlePhase({ account_id: stage.account.mt5_login, status });
      // The parent refetches; nothing here caches a challenge's state of its own, so
      // there is no local row to patch and no chance of the two disagreeing.
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className="pa-card pc-card">
      <div className="pa-card-head">
        <div className="pa-card-id">
          <span className="pa-card-name">{row.name}</span>
          <span className="pa-card-sub">
            {money(row.size)}
            {` · ${row.filled} of ${stages.length} phases`}
          </span>
        </div>
        {/* The rail carries the position, so the badge carries the one thing it cannot:
            whether the CHALLENGE is still running. */}
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <LifecycleRail
        stages={stages}
        activeTone={railTone}
        compact
        selected={selected}
        onSelect={onSelectPhase}
      />

      <div className="pc-phase">
        <div className="pc-phase-head">
          <span className="pc-phase-title">{stage ? stage.label : 'No phase'}</span>
          <span className="pc-phase-meta">
            {stage?.attempts > 1 ? `Attempt ${stage.attempts} · ` : ''}
            {stage?.account ? stage.account.label : 'Not added yet'}
          </span>
        </div>

        {stage?.account == null ? (
          /* THE PHASE THE FIRM HAS ISSUED AND WE HAVE NOT BEEN TOLD ABOUT. The button is
             the whole content, and it goes straight into the wizard's existing-challenge
             branch with this challenge preselected — the trader has already told us which
             challenge by clicking its rail, and asking again on page 3 would be asking
             twice. */
          stage?.addable ? (
            <div className="pc-phase-add">
              <p className="pc-phase-add-note">
                Your firm issues a new login for this phase. Add it to keep this challenge
                in one place.
              </p>
              <Button
                variant="primary"
                size="sm"
                render={<Link to={`/accounts/new/account?challenge=${row.id}`} />}
              >
                <Plus aria-hidden="true" />
                <span>{`Add ${stage.label} Account`}</span>
              </Button>
            </div>
          ) : (
            <p className="pc-phase-add-note">
              This phase has no account yet. It opens when the phase before it passes.
            </p>
          )
        ) : (
          <>
            {/* A phase with no live state is a CLOSED one — passing removes it from the
                engine. It keeps its capital and its verdict and shows no meters, rather
                than four bars at zero that read as a challenge going badly. */}
            {state ? (
              <div className="pa-card-meters">
                {target ? (
                  <MiniMeter
                    label={stage.id === 'funded' ? 'Payout Target' : 'Profit Target'}
                    value={target.current}
                    limit={target.target}
                    pct={target.pctToTarget}
                    tone={stage.id === 'funded' ? 'payout' : 'target'}
                    note={target.reached
                      ? 'Target reached'
                      : `${pct1(target.pctToTarget)} of target · ${money(target.target - target.current)} to go`}
                  />
                ) : (
                  <div className="pa-meter prop-na">
                    <div className="pa-meter-head">
                      <span className="pa-meter-label">Profit Target</span>
                      <span className="pa-meter-val muted">Not set</span>
                    </div>
                    <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: '0%' }} /></div>
                    <div className="pa-meter-note">No target on this phase.</div>
                  </div>
                )}

                <MiniMeter
                  label="Drawdown Used"
                  value={maxUsed}
                  limit={state.maxDd?.limit}
                  pct={maxPct}
                  tone={maxSt}
                  note={`${pct1(maxPct)} used · ${money(state.maxDd?.roomLeft)} remaining`}
                />
              </div>
            ) : null}

            <div className="pa-card-figures">
              <div className="pa-fig">
                <span className="pa-fig-label">Capital</span>
                <span className="pa-fig-value num">{money(capital)}</span>
              </div>
              <div className="pa-fig">
                <span className="pa-fig-label">P&amp;L</span>
                <span className={`pa-fig-value num jo-trade-val ${signTone(pnl)}`}>
                  {pnl == null ? '—' : fmtMoney(pnl, { sign: true })}
                </span>
              </div>
              <div className="pa-fig">
                <span className="pa-fig-label">{state ? 'Health' : 'Phase'}</span>
                <span className={`pa-fig-value pa-status-${state ? health : 'good'}`}>
                  {state
                    ? HEALTH_LABEL[health]
                    : stage.status === 'complete' ? 'Passed' : 'Breached'}
                </span>
              </div>
            </div>

            <div className="pa-card-foot">
              <span className="pa-card-days">
                {state?.tradingDays?.required
                  ? `${state.tradingDays.completed}/${state.tradingDays.required} trading days`
                  : 'No day requirement'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenAccount(stage.account.mt5_login)}
              >
                View Details
              </Button>
            </div>

            {/* THE OVERRIDE. Offered on a RUNNING phase as the two verdicts a firm can
                reach, and on a settled one as the way back — never both, because a phase
                is in one state and a row of four buttons would imply it could be in two.
                Ghost buttons: this is the correction, not the action the card is for. */}
            <div className="pc-phase-override">
              {stage.status === 'active' ? (
                <>
                  <Button variant="ghost" size="sm" disabled={busy !== ''} onClick={() => settle('passed')}>
                    {busy === 'passed' ? 'Marking…' : 'Mark passed'}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy !== ''} onClick={() => settle('breached')}>
                    {busy === 'breached' ? 'Marking…' : 'Mark breached'}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" disabled={busy !== ''} onClick={() => settle('active')}>
                  {busy === 'active' ? 'Reopening…' : `Reopen ${stage.label}`}
                </Button>
              )}
              {err ? <span className="pc-phase-error">{err}</span> : null}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
