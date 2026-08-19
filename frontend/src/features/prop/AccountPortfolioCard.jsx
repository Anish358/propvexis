import React from 'react';
import { Badge, Button, Card } from '@/components/primitives';
import { fmtMoney } from '../../lib/metrics.js';
import { roomStatus, healthStatus } from './PropOS.jsx';
import { PHASE_LABEL } from './propAccounts.js';

// ---------------------------------------------------------------------------
// Portfolio account card — one account, scannable in a grid beside its siblings.
//
// WHAT A CARD IS FOR, and therefore what it is not. Portfolio answers "which of my
// accounts needs me?", so a card carries the figures that answer it at a glance —
// where the account stands against its target, and how much drawdown room is left
// — and then hands off. It is NOT a small copy of the Details view: the full rule
// section, the equity curve and the trade history live one click away, and
// duplicating a thinner version of them here would be two treatments of the same
// data for a reader to reconcile.
//
// The bars are the SAME used/limit framing as the Dashboard's Account Details
// meters (AccountDetails.jsx) — bar fills up as risk grows, status is a word plus
// a colour and never a colour alone — drawn at card density. They share
// `roomStatus`, so a card and the Details section it opens can never disagree
// about what counts as at risk.
// ---------------------------------------------------------------------------

const money = (n) => (n == null ? '—' : fmtMoney(n));
const pct1 = (f) => `${((f || 0) * 100).toFixed(1)}%`;
const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// Status is a WORD first; colour only reinforces it — the same rule the Overview's
// payout statuses follow.
const HEALTH_LABEL = { good: 'On Track', warn: 'At Risk', bad: 'Critical', na: 'No Data' };

// One "$used / $limit" bar at card density. Exported because Prop OS > Challenges
// draws the same two bars on its challenge cards, and a second copy of this markup is
// how a card in one module and a card in the other would drift apart on what a
// drawdown bar looks like. The classes travel with the component, which is why the
// challenge card carries `.pa-meter*` rules it does not own.
export function MiniMeter({ label, value, limit, pct, tone, note }) {
  return (
    <div className={`pa-meter prop-${tone}`}>
      <div className="pa-meter-head">
        <span className="pa-meter-label">{label}</span>
        <span className="pa-meter-val">{money(value)} <span className="muted">/ {money(limit)}</span></span>
      </div>
      <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, pct || 0)) * 100)}%` }} /></div>
      {note && <div className="pa-meter-note">{note}</div>}
    </div>
  );
}

export default function AccountPortfolioCard({ row, onSelect }) {
  const breached = Boolean(row.breach?.breached);
  const health = healthStatus(row.health?.score ?? 0, breached);
  const maxSt = roomStatus(row.maxDd?.fracRemaining, row.maxDd?.breached);
  const daySt = roomStatus(row.dailyDd?.fracRemaining, row.dailyDd?.breached);

  const maxUsed = row.maxDd ? row.maxDd.limit - row.maxDd.roomLeft : null;
  const maxPct = row.maxDd?.limit ? maxUsed / row.maxDd.limit : 0;
  const dayPct = row.dailyDd?.limit ? row.dailyDd.usedToday / row.dailyDd.limit : 0;
  const target = row.profitTarget;
  const days = row.tradingDays;

  return (
    <Card className="pa-card">
      <div className="pa-card-head">
        <div className="pa-card-id">
          <span className="pa-card-name">{row.label}</span>
          <span className="pa-card-sub">
            {row.firmName} · {money(row.accountSize)}
            {row.isManual && ' · Manual'}
          </span>
        </div>
        <Badge tone={breached ? 'loss' : row.phase === 'funded' ? 'profit' : 'neutral'}>
          {PHASE_LABEL[row.phase] || row.phase}
        </Badge>
      </div>

      <div className="pa-card-figures">
        <div className="pa-fig">
          <span className="pa-fig-label">Balance</span>
          <span className="pa-fig-value">{money(row.balance)}</span>
        </div>
        <div className="pa-fig">
          <span className="pa-fig-label">Profit</span>
          <span className={`pa-fig-value num jo-trade-val ${signTone(row.pnl)}`}>
            {row.pnl == null ? '—' : fmtMoney(row.pnl, { sign: true })}
          </span>
        </div>
        <div className="pa-fig">
          <span className="pa-fig-label">Status</span>
          <span className={`pa-fig-value pa-status-${health}`}>{HEALTH_LABEL[health]}</span>
        </div>
      </div>

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
          // A funded account with no target set is not a card with a missing bar —
          // it is an account that has nothing to reach, and says so.
          <div className="pa-meter prop-na">
            <div className="pa-meter-head">
              <span className="pa-meter-label">Profit Target</span>
              <span className="pa-meter-val muted">Not set</span>
            </div>
            <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: '0%' }} /></div>
            <div className="pa-meter-note">No target on this account.</div>
          </div>
        )}

        <MiniMeter
          label="Daily Drawdown"
          value={row.dailyDd?.usedToday}
          limit={row.dailyDd?.limit}
          pct={dayPct}
          tone={daySt}
          note={`${pct1(dayPct)} used · ${money(row.dailyDd?.roomLeft)} remaining`}
        />
        <MiniMeter
          label="Max Drawdown"
          value={maxUsed}
          limit={row.maxDd?.limit}
          pct={maxPct}
          tone={maxSt}
          note={`${pct1(maxPct)} used · ${money(row.maxDd?.roomLeft)} remaining`}
        />
      </div>

      <div className="pa-card-foot">
        <span className="pa-card-days">
          {days ? `${days.completed}/${days.required} trading days` : 'No day requirement'}
        </span>
        <Button variant="secondary" size="sm" onClick={onSelect}>Select</Button>
      </div>
    </Card>
  );
}

// A passed evaluation is a RECORD WITH TWO DATES, not a live account — the same
// reading the Overview's Accounts card takes of its own "Passed Eval" slice. It has
// no drawdown room and no target left to reach, so a card carrying empty meters
// would be four bars saying nothing. Select still works: it opens the account those
// dates belong to, which is live and does have all of that.
export function PassedAccountCard({ row, onSelect }) {
  return (
    <Card className="pa-card pa-card--passed">
      <div className="pa-card-head">
        <div className="pa-card-id">
          <span className="pa-card-name">{row.label}</span>
          <span className="pa-card-sub">{row.firmName}</span>
        </div>
        <Badge tone="profit">{PHASE_LABEL[row.phase] || row.phase} Passed</Badge>
      </div>

      <div className="pa-card-figures">
        <div className="pa-fig">
          <span className="pa-fig-label">Started</span>
          <span className="pa-fig-value num">{row.startDate || '—'}</span>
        </div>
        <div className="pa-fig">
          <span className="pa-fig-label">Passed</span>
          <span className="pa-fig-value num">{row.passedDate || '—'}</span>
        </div>
      </div>

      <div className="pa-card-foot">
        <span className="pa-card-days">Evaluation cleared</span>
        <Button variant="secondary" size="sm" onClick={onSelect}>Select</Button>
      </div>
    </Card>
  );
}
