import React from 'react';
import { Card } from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import { StatContext } from '../dashboard/DashWidgets.jsx';
import { fmtMoney } from '../../lib/metrics.js';
import { STAGE_STATUS_LABEL, stageFigures } from './challengesData.js';

// The three STAGE KPI tiles for Prop OS › Challenges › Details — Phase 1, Phase 2,
// Funded. One tile per stage of the selected challenge, so "where does this challenge
// stand" is answered before the lifecycle below it is read at all.
//
// GEOMETRY IS BORROWED, NOT REDEFINED, exactly as AccountKpiCards.jsx and
// PropKpiCards.jsx borrow it. Net P&L in KpiCards.jsx is the locked master card;
// every tile renders the same `dash-stat dash-stat--typo-match` box with
// `spacing="none"` and adds no sizing of its own. Content adapts to the container,
// never the reverse.
//
// WHAT EACH TILE SAYS, AND WHAT IT REFUSES TO SAY. The prop engine computes equity
// for the ACTIVE challenge only — that is the one whose drawdown still matters — so a
// stage that closed months ago has no stored final balance. Those tiles show a dash
// and their pass date rather than a number nobody recorded, and a stage that has not
// started shows a dash and the word Upcoming. Inventing a balance for either would
// make the row look complete at the cost of being wrong.
//
// EMPHASIS ON THE CURRENT STAGE IS NEUTRAL, NOT BRANDED (DESIGN-LANGUAGE N4: brand
// colour never tints chrome). The current tile is marked by a stronger neutral border
// and by the fact that it is the only one carrying live figures; its status word takes
// the semantic colour of the challenge's health.

const money = (n) => (n == null ? '—' : fmtMoney(n));
const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : null);

const STAGE_TONE = { complete: 'good', breached: 'bad', upcoming: 'na', skipped: 'na' };

const EXPLAIN = {
  p1: 'The first evaluation phase of this challenge. Its balance and P&L are live while the phase is the one you are trading; once it is passed, its rules and pass date stay on record here.',
  p2: 'The second evaluation phase, where a firm runs one. If this challenge has no Phase 2, this tile says so rather than showing figures that do not exist.',
  funded: 'The funded account this challenge is working toward. It carries live figures once the challenge reaches it.',
};

/**
 * One stage tile.
 *
 * `stage` is an entry from `challengeLifecycle()`; `state` is the engine state for
 * the challenge's ACTIVE phase, used only by the tile that stage belongs to.
 * `activeTone` is the live health tone, handed in for the same reason the lifecycle
 * rail takes it: health is the engine's verdict, not this component's.
 */
export function StageKpiCard({ stage, state, activeTone = 'na' }) {
  const { balance, pnl, live } = stageFigures(stage, state);
  const tone = stage.status === 'active' ? activeTone : STAGE_TONE[stage.status] || 'na';

  // The context row carries the stage's STATUS as its label and the best supporting
  // figure as its value — the P&L where the stage is live, the date where it closed.
  const contextValue = live
    ? (pnl == null ? '—' : fmtMoney(pnl, { sign: true }))
    : stage.status === 'complete'
      ? (fmtDate(stage.passedDate) || '—')
      : '—';

  return (
    <Card
      spacing="none"
      className={`dash-stat dash-stat--typo-match pc-stage-kpi prop-${tone}${stage.current ? ' pc-stage-kpi--current' : ''}`}
    >
      <div className="jo-kpi-label">
        {stage.label}
        <Explain size={13} nudgeY={-1} openUp>{EXPLAIN[stage.id] || EXPLAIN.p1}</Explain>
      </div>
      <div className="jo-kpi-value">{money(balance)}</div>
      <StatContext
        label={STAGE_STATUS_LABEL[stage.status]}
        value={contextValue}
        tone={live ? signTone(pnl) : ''}
      />
    </Card>
  );
}

/**
 * The KPI row: one tile per stage of the selected challenge, in lifecycle order.
 *
 * `--kpi-count` splits the row, exactly as every other KPI row in the app does, so a
 * one-step firm gets two tiles at full width rather than three with a hole in it.
 */
export default function ChallengeKpiCards({ stages = [], state, activeTone = 'na' }) {
  return (
    <div className="jo-kpis dash-stats" style={{ '--kpi-count': stages.length || 1 }}>
      {stages.map((s) => (
        <StageKpiCard key={s.id} stage={s} state={state} activeTone={activeTone} />
      ))}
    </div>
  );
}
