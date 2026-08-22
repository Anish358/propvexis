import React from 'react';
import { Badge, Button, Card } from '@/components/primitives';
import { fmtMoney } from '../../lib/metrics.js';
import { healthStatus, roomStatus } from './PropOS.jsx';
import { isBreached } from './propAccounts.js';
import { challengeLifecycle } from './challengesData.js';
import { MiniMeter } from './AccountPortfolioCard.jsx';
import { LifecycleRail } from './ChallengeLifecycle.jsx';

// ---------------------------------------------------------------------------
// Challenge card — one challenge, scannable beside its siblings at the same firm.
//
// WHAT SEPARATES IT FROM THE ACCOUNTS CARD, since the two show the same account.
// `AccountPortfolioCard` answers "which of my accounts needs me now?", so it leads
// with three drawdown/target meters. This answers "how is this challenge progressing
// toward funding?", so it leads with WHERE ON THE JOURNEY the challenge is — the same
// lifecycle rail the Details tab draws, at card size — and carries the two figures
// that decide whether the next stage is reachable: the target it must hit and the
// drawdown it has spent. That is the module boundary the product asked for, drawn in
// the cards rather than asserted in a header comment.
//
// AND WHAT IT REUSES, which is everything else: the meter is `MiniMeter` from that
// same accounts card, the rail is `LifecycleRail` from the Details lifecycle, the
// thresholds are the shared `roomStatus` / `healthStatus`, and the card's frame,
// figure strip and footer are the `.pa-card*` rules already written for a card of
// this shape. The only styling this file needs that did not exist is the grid it
// sits in.
//
// NO SECOND FETCH BEHIND A CARD. The lifecycle here is derived from the active
// challenge's phase alone (`history: null` — see challengeLifecycle), because the
// whole grid is built from one portfolio request. The dated, per-attempt lifecycle
// arrives on the Details tab, where one challenge is worth one request.
// ---------------------------------------------------------------------------

const money = (n) => (n == null ? '—' : fmtMoney(n));
const pct1 = (f) => `${((f || 0) * 100).toFixed(1)}%`;
const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// Status is a WORD first; colour only reinforces it.
const HEALTH_LABEL = { good: 'On Track', warn: 'At Risk', bad: 'Critical', na: 'No Data' };

export default function ChallengeCard({ row, onSelect }) {
  const breached = isBreached(row);
  const health = healthStatus(row.health?.score ?? 0, breached);
  const maxSt = roomStatus(row.maxDd?.fracRemaining, row.maxDd?.breached);

  const maxUsed = row.maxDd ? row.maxDd.limit - row.maxDd.roomLeft : null;
  const maxPct = row.maxDd?.limit ? maxUsed / row.maxDd.limit : 0;
  const target = row.profitTarget;

  const stages = challengeLifecycle({ phase: row.phase, stages: row.stages, breached });
  const current = stages.find((s) => s.current) || null;

  return (
    <Card className="pa-card pc-card">
      <div className="pa-card-head">
        <div className="pa-card-id">
          <span className="pa-card-name">{row.label}</span>
          <span className="pa-card-sub">
            {money(row.accountSize)}
            {current ? ` · ${current.label} of ${current.of}` : ''}
            {row.isManual && ' · Manual'}
          </span>
        </div>
        {/* The lifecycle position is the rail's job, so the badge carries the one
            thing the rail cannot: whether the challenge is still running. */}
        <Badge tone={breached ? 'loss' : row.phase === 'funded' ? 'profit' : 'neutral'}>
          {breached ? 'Breached' : row.phase === 'funded' ? 'Funded' : 'Active'}
        </Badge>
      </div>

      <LifecycleRail stages={stages} activeTone={health} compact />

      <div className="pa-card-meters">
        {target ? (
          <MiniMeter
            label={row.phase === 'funded' ? 'Payout Target' : 'Profit Target'}
            value={target.current}
            limit={target.target}
            pct={target.pctToTarget}
            tone={row.phase === 'funded' ? 'payout' : 'target'}
            note={target.reached
              ? 'Target reached'
              : `${pct1(target.pctToTarget)} of target · ${money(target.target - target.current)} to go`}
          />
        ) : (
          // A funded challenge with no target set has nothing to reach, which is a
          // different fact from being at 0% of one.
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
          limit={row.maxDd?.limit}
          pct={maxPct}
          tone={maxSt}
          note={`${pct1(maxPct)} used · ${money(row.maxDd?.roomLeft)} remaining`}
        />
      </div>

      <div className="pa-card-figures">
        <div className="pa-fig">
          <span className="pa-fig-label">Capital</span>
          <span className="pa-fig-value num">{money(row.accountSize)}</span>
        </div>
        <div className="pa-fig">
          <span className="pa-fig-label">P&amp;L</span>
          <span className={`pa-fig-value num jo-trade-val ${signTone(row.pnl)}`}>
            {row.pnl == null ? '—' : fmtMoney(row.pnl, { sign: true })}
          </span>
        </div>
        <div className="pa-fig">
          <span className="pa-fig-label">Health</span>
          <span className={`pa-fig-value pa-status-${health}`}>{HEALTH_LABEL[health]}</span>
        </div>
      </div>

      <div className="pa-card-foot">
        <span className="pa-card-days">
          {row.tradingDays?.required
            ? `${row.tradingDays.completed}/${row.tradingDays.required} trading days`
            : 'No day requirement'}
        </span>
        <Button variant="secondary" size="sm" onClick={onSelect}>View Details</Button>
      </div>
    </Card>
  );
}
