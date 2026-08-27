import React from 'react';
import { Card } from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import { fmtMoney } from '../../lib/metrics.js';
import { roomStatus } from './PropOS.jsx';
import { STAGE_STATUS_LABEL, currentStageMetrics } from './challengesData.js';

// ---------------------------------------------------------------------------
// The Challenge Lifecycle — ONE visualisation of Phase 1 → Phase 2 → Funded, and
// the reason the Details tab exists.
//
// WHAT IT HAS TO COMMUNICATE, in one look: these are not three accounts that happen
// to belong to the same firm, they are three stages of ONE journey, and the trader is
// standing at exactly one of them. So the stages sit on a single connected rail
// rather than in three cards side by side, the rail behind the current stage is
// drawn as travelled and the rail ahead of it is not, and only the current stage
// opens into figures. Three equal panels would say "three things"; a rail with one
// lit stop says "one journey, here".
//
// EVERY STATE IS DERIVED, NOT WRITTEN. Which stage is active, which are behind and
// which are still ahead comes from `challengeLifecycle()` in challengesData.js,
// off the active challenge's phase and the account's challenge-row history. This
// file draws what it is handed and decides nothing.
//
// COLOUR IS NEVER THE ONLY SIGNAL. Each stop carries a mark that differs by state —
// a tick for a phase passed, a cross for one breached, its step number otherwise —
// and a status WORD under it, because green-vs-red alone is the classic
// colour-vision-deficiency confusion. The tones are the app's shared
// `.prop-good|warn|bad|na` classes, and the current stage takes its tone from the
// SAME `roomStatus` thresholds the drawdown meters use, so the rail and the bars
// under it can never disagree about whether a challenge is in trouble.
// ---------------------------------------------------------------------------

const cx = (...parts) => parts.filter(Boolean).join(' ');
const money = (n) => (n == null ? '—' : fmtMoney(n));
const pct1 = (f) => `${((f || 0) * 100).toFixed(1)}%`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

// A stage's tone follows its state. The ACTIVE stage is the exception: its colour is
// the live health of the challenge running there, which only the engine knows, so it
// is handed in.
const STAGE_TONE = { complete: 'good', breached: 'bad', upcoming: 'na', skipped: 'na' };
const toneOf = (stage, activeTone) => (stage.status === 'active' ? activeTone : STAGE_TONE[stage.status] || 'na');

// The mark inside a stop. Deliberately different SHAPES per state, not one shape in
// different colours — see the header.
const markOf = (stage) => {
  if (stage.status === 'complete') return '✓';
  if (stage.status === 'breached') return '✕';
  if (stage.status === 'skipped') return '–';
  return String(stage.step);
};

/**
 * The rail itself, shared by the Details lifecycle and the challenge cards.
 *
 * ONE IMPLEMENTATION, TWO DENSITIES. A card needs the same "where is this challenge"
 * answer the Details page gives, at card size — and a second, smaller stepper drawn
 * separately is how the two would end up disagreeing about what a passed phase looks
 * like. `compact` drops the status words (the card carries a status badge already)
 * and shrinks the stops; nothing else differs.
 *
 * THE STOPS ARE BUTTONS WHEN THERE IS SOMEWHERE TO GO (owner spec 2026-08-27), which is
 * what makes a multi-account challenge navigable: each phase now has its OWN account, so
 * the rail is the only control that can move between them. `onSelect` turns them on;
 * without it the rail is the read-only stepper it has always been, which is what the
 * Details lifecycle still wants.
 *
 * ELIGIBILITY IS THE STAGE'S, NOT THE RAIL'S. A stop is a button only when
 * `stage.selectable` says so — it has an account to show, or it is the phase the firm
 * has just issued. Every other stop stays a plain `<span>`: a disabled button that
 * cannot ever be enabled is a control that explains nothing, and there is nothing
 * behind a phase that neither exists nor can be created yet.
 *
 * A REAL BUTTON, so it is reachable by Tab and fires on Enter and Space for free.
 * `aria-current` carries the selection to a screen reader, because the ring around the
 * chosen stop is styling and reads as nothing.
 */
export function LifecycleRail({
  stages = [], activeTone = 'na', compact = false, onSelect = null, selected = null,
}) {
  const last = stages.length - 1;
  return (
    <ol className={cx('pc-rail', compact && 'pc-rail--compact')}>
      {stages.map((s, i) => {
        // A leg of the rail is "travelled" once the stage behind it is cleared. A
        // skipped stage is not travelled through — the journey never went that way.
        const inDone = i > 0 && stages[i - 1].status === 'complete';
        const outDone = s.status === 'complete';
        const clickable = Boolean(onSelect) && s.selectable === true;
        const body = (
          <>
            <span className="pc-step-track" aria-hidden="true">
              <span className={cx('pc-step-line', i === 0 && 'is-end', inDone && 'is-travelled')} />
              <span className="pc-step-node">{markOf(s)}</span>
              <span className={cx('pc-step-line', i === last && 'is-end', outDone && 'is-travelled')} />
            </span>
            <span className="pc-step-text">
              <span className="pc-step-label">{s.label}</span>
              {!compact && <span className="pc-step-status">{STAGE_STATUS_LABEL[s.status]}</span>}
            </span>
          </>
        );
        return (
          <li
            key={s.id}
            className={cx(
              'pc-step', `prop-${toneOf(s, activeTone)}`, `pc-step--${s.status}`,
              // The phase the firm has just issued, and the leg leading into it: the one
              // thing on this card the trader can act on, so it is the one thing that
              // moves. Set on the STAGE rather than only on the selected one, because the
              // point is to be noticed before it is clicked.
              s.addable && 'pc-step--next',
              selected === s.id && 'is-selected',
            )}
            title={`${s.label}: ${STAGE_STATUS_LABEL[s.status]}`}
          >
            {clickable ? (
              <button
                type="button"
                className="pc-step-btn"
                onClick={() => onSelect(s.id)}
                aria-current={selected === s.id ? 'step' : undefined}
              >
                {body}
              </button>
            ) : body}
          </li>
        );
      })}
    </ol>
  );
}

// ---- the current stage's rule metrics -------------------------------------

// One rule the current phase is judged by: the firm's headline percentage as the
// figure, the live progress as a bar, the dollars underneath.
//
// NOT `MiniMeter` (AccountPortfolioCard.jsx), and the difference is the question
// being answered rather than a second style. A meter on a card answers "how much
// room is left" and leads with the dollars. This answers "what does this phase
// require of me", and leads with the rule — a trader reads "Max Drawdown 10%" as the
// firm's term and the bar under it as their standing against it. The bar, the track
// and the tone classes are the app's shared ones either way.
function StageMetric({ m }) {
  const tone = m.kind === 'room'
    // The SAME thresholds the drawdown meters use — imported, never restated.
    ? roomStatus(m.fracRemaining, m.breached)
    : m.kind === 'days'
      ? (m.met ? 'good' : 'target')
      : m.reached ? 'good' : m.kind;

  // The rule's percentage where the firm states one, the requirement itself where it
  // does not (minimum trading days is a count of days, not a share of the balance).
  const value = m.rulePct != null
    ? `${Number(m.rulePct)}%`
    : m.kind === 'days' ? `${m.current} / ${m.limit}` : money(m.limit);

  const note = m.kind === 'room'
    ? `${pct1(m.frac)} used · ${money(m.roomLeft)} remaining`
    : m.kind === 'days'
      ? (m.met ? 'Requirement met' : `${m.limit - m.current} more needed`)
      : m.reached
        ? 'Target reached'
        : `${money(m.current)} of ${money(m.limit)} · ${money(m.limit - m.current)} to go`;

  return (
    <div className={`pc-metric prop-${tone}`}>
      <div className="pc-metric-label">{m.label}</div>
      <div className="pc-metric-value">{value}</div>
      <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: `${Math.round(m.frac * 100)}%` }} /></div>
      <div className="pc-metric-note">{note}</div>
    </div>
  );
}

// ---- the lifecycle section -------------------------------------------------

export default function ChallengeLifecycle({ stages, state, activeTone = 'na' }) {
  const current = stages.find((s) => s.current) || null;
  // Live figures exist for the ACTIVE challenge only — that is the one the engine
  // computes — so the detail area belongs to the current stage and to no other.
  const metrics = current ? currentStageMetrics({ state, challenge: current.challenge }) : [];
  const started = fmtDate(current?.startDate);

  return (
    <Card className="pc-lifecycle">
      <div className="prop-card-head">
        <h3>Challenge Lifecycle</h3>
        <Explain>
          One challenge, from evaluation to funding. Each stop is a phase of THIS
          challenge — passed phases are ticked, the phase you are on is lit and shows
          its rules below, and phases still ahead are drawn but empty. Where a firm
          runs no second evaluation phase, that stop says so instead of showing figures
          it does not have.
        </Explain>
      </div>

      <LifecycleRail stages={stages} activeTone={activeTone} />

      {current ? (
        <div className="pc-current">
          <div className="pc-current-head">
            <span className="pc-current-title">Current: {current.label}</span>
            <span className="pc-current-meta">
              {current.attempts > 1 && `Attempt ${current.attempts} · `}
              {started ? `Started ${started}` : 'Not started'}
            </span>
          </div>
          {metrics.length ? (
            <div className="pc-metrics">
              {metrics.map((m) => <StageMetric key={m.key} m={m} />)}
            </div>
          ) : (
            // A funded account with no target and no day requirement genuinely has
            // no rules left to progress against. Saying so beats four empty bars.
            <p className="pc-current-none">
              This phase carries no profit target, drawdown limit or trading-day
              requirement on this account.
            </p>
          )}
        </div>
      ) : (
        <p className="pc-current-none">
          This challenge has no active phase, so there is nothing in progress to show.
        </p>
      )}
    </Card>
  );
}
