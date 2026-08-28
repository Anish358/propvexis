import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Card, Tabs, EmptyState } from '@/components/primitives';
import { fmtMoney } from '../../lib/metrics.js';
import { chartPalette } from '../../lib/theme.js';
import { settlePhase } from '../../lib/api.js';
import PayoutCycleModal from './PayoutCycleModal.jsx';
import { PHASE_LABEL } from './propAccounts.js';

// The Prop OS Overview's content cards. All data comes server-computed from
// GET /api/prop/overview (src/domain/prop/propOverview.js) — these components format and
// arrange, they don't decide anything. The rules for "overdue", "ineligible",
// "remaining to pass" and so on live in one tested module rather than in JSX.

// PHASE_LABEL comes from propAccounts.js — one map, or p3 gets added to one of two.
const money = (n) => (n == null ? '—' : fmtMoney(n));
const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// ---------------------------------------------------------------------------
// Prop firms — how many accounts you run at each firm, split funded vs eval.
// ---------------------------------------------------------------------------

export function FirmsCard({ firms = [] }) {
  return (
    <Card className="prop-card-box card-md">
      <div className="prop-card-head"><h3>Prop firms</h3></div>
      {firms.length === 0 ? (
        <EmptyState title="No active accounts" description="Firms show up here once you have an account with challenge rules." />
      ) : (
        <div className="prop-table-wrap">
          <table className="prop-table">
            <thead>
              <tr><th>Firm</th><th className="num">Funded</th><th className="num">Eval</th></tr>
            </thead>
            <tbody>
              {firms.map((f) => (
                <tr key={f.firmId || 'other'}>
                  <td>{f.firmName}</td>
                  <td className="num">{f.funded}</td>
                  <td className="num">{f.evaluation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Upcoming payouts — the schedule, not the history.
// ---------------------------------------------------------------------------

// Status is a WORD plus a colour, never a colour alone.
const PAYOUT_STATUS = {
  upcoming: { label: 'Upcoming', cls: '' },
  due: { label: 'Due today', cls: 'good' },
  overdue: { label: 'Overdue', cls: 'warn' },
  ineligible: { label: 'Not eligible', cls: 'muted' },
};

export function UpcomingPayoutsCard({ payouts = [], accounts = [], onChanged }) {
  const [editing, setEditing] = useState(null);
  const acctFor = (accountId) => accounts.find((a) => String(a.mt5_login) === String(accountId));

  return (
    <Card className="prop-card-box card-md">
      <div className="prop-card-head"><h3>Upcoming payouts</h3></div>
      {payouts.length === 0 ? (
        <EmptyState
          title="No payouts scheduled"
          description="Funded accounts get a payout date automatically, two weeks after your last one by default."
        />
      ) : (
        <div className="prop-table-wrap">
          <table className="prop-table">
            <thead>
              <tr><th>Account</th><th className="num">Amount</th><th>Date</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {payouts.map((p) => {
                const st = PAYOUT_STATUS[p.status] || PAYOUT_STATUS.upcoming;
                const acct = acctFor(p.accountId);
                return (
                  <tr key={p.accountId}>
                    <td title={p.firmName}>{p.label}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td className="num">{p.dueDate}</td>
                    <td>
                      <span className={`prop-status ${st.cls}`}>{st.label}</span>
                      {p.status === 'ineligible' && p.daysToGo > 0 && (
                        <span className="muted"> · {p.daysToGo}d</span>
                      )}
                    </td>
                    <td className="prop-row-action">
                      {acct && (
                        <button
                          type="button"
                          className="prop-mini-btn"
                          title="Edit payout cycle"
                          aria-label={`Edit payout cycle for ${p.label}`}
                          onClick={() => setEditing(p)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && acctFor(editing.accountId) && (
        <PayoutCycleModal
          row={editing}
          account={acctFor(editing.accountId)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged?.(); }}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recent transactions — payouts and fees on one signed timeline, because that is
// how the money actually moved.
// ---------------------------------------------------------------------------

export function TransactionsCard({ transactions = [] }) {
  return (
    <Card className="prop-card-box card-md">
      <div className="prop-card-head"><h3>Recent transactions</h3></div>
      {transactions.length === 0 ? (
        <EmptyState title="Nothing yet" description="Payouts you receive and fees you pay show up here together." />
      ) : (
        <div className="prop-table-wrap">
          <table className="prop-table">
            <thead>
              <tr><th>Date</th><th>Account</th><th>Type</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="num">{String(t.date).slice(0, 10)}</td>
                  <td title={t.accountLabel}>{t.accountLabel}</td>
                  <td>{t.description}</td>
                  <td className={`num jo-trade-val ${signTone(t.amount)}`}>{fmtMoney(t.amount, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Accounts — a ring of the portfolio's composition, then one table per slice.
//
// The three slices carry DIFFERENT columns on purpose: a funded account is judged
// on what it has paid, an evaluation account on what it still has to earn, and a
// passed evaluation is a record with two dates. One shared column set would serve
// none of them.
// ---------------------------------------------------------------------------

const SLICES = [
  { value: 'funded', label: 'Funded' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'passed', label: 'Passed Eval' },
];

function AccountsRing({ ring }) {
  const p = chartPalette();
  const data = useMemo(() => ([
    { name: 'Funded', value: ring.funded, fill: p.profit },
    { name: 'Evaluation', value: ring.evaluation, fill: p.accent },
    { name: 'Passed Eval', value: ring.passed, fill: p.axis },
  ].filter((d) => d.value > 0)), [ring, p.profit, p.accent, p.axis]);

  const total = ring.funded + ring.evaluation;
  if (data.length === 0) return null;

  return (
    <div className="prop-ring">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={64} paddingAngle={2} stroke="none">
            {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
          </Pie>
          <Tooltip contentStyle={chartPalette().tip} labelStyle={{ color: chartPalette().label }} />
        </PieChart>
      </ResponsiveContainer>
      {/* The hole carries the headline count, so the ring reads without the legend. */}
      <div className="prop-ring-center">
        <div className="prop-ring-num">{total}</div>
        <div className="prop-ring-cap">active</div>
      </div>
      <div className="prop-ring-legend">
        {data.map((d) => (
          <span key={d.name} className="prop-ring-key">
            <span className="prop-ring-dot" style={{ background: d.fill }} />
            {d.name} · {d.value}
          </span>
        ))}
      </div>
    </div>
  );
}

/* Marking a phase passed by hand — the manual override, on the row for the account it
 * acts on.
 *
 * IT SETTLES THE PHASE AND OPENS NOTHING (rewritten 2026-08-27). It used to call
 * /api/prop/advance, which closes the active challenge AND opens the next phase's
 * challenge on the SAME account — correct while a challenge WAS an account, and wrong
 * since 0027: a firm issues a NEW LOGIN per phase, so that write invented a Phase 2 on
 * the Phase 1 account and swallowed the "add the next phase account" invitation the whole
 * multi-account model exists to give. `settlePhase` closes the phase and leaves the
 * challenge waiting for the login that is actually coming.
 *
 * Which also removes the next-phase arithmetic this function used to carry: there is no
 * `to_phase` to compute any more, so `phasesFor` is no longer this component's business —
 * the ladder is read where the next account is ADDED, not where a phase is closed.
 *
 * The same override, with the reopen half, is on Prop OS › Challenges' phase panel, where
 * the rail shows which phase it acts on. Both call one endpoint on purpose. */
function AdvanceButton({ row, onChanged }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="prop-mini-btn"
      disabled={busy}
      title={`Mark ${PHASE_LABEL[row.phase]} passed`}
      aria-label={`Mark ${PHASE_LABEL[row.phase]} passed for ${row.label}`}
      onClick={async () => {
        setBusy(true);
        try {
          await settlePhase({ account_id: row.accountId, status: 'passed' });
          onChanged?.();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? '…' : 'Mark passed'}
    </button>
  );
}

export function AccountsCard({ accounts, onChanged }) {
  const [slice, setSlice] = useState('funded');
  const b = accounts || { ring: { funded: 0, evaluation: 0, passed: 0 }, funded: [], evaluation: [], passed: [] };
  const rows = b[slice] || [];

  return (
    <Card className="prop-card-box prop-accounts-card card-lg">
      <div className="prop-card-head"><h3>Accounts</h3></div>
      <AccountsRing ring={b.ring} />

      <Tabs tabs={SLICES} value={slice} onChange={setSlice} />

      <div className="prop-table-wrap prop-accounts-table">
        {rows.length === 0 ? (
          <EmptyState
            title={`No ${SLICES.find((s) => s.value === slice).label.toLowerCase()} accounts`}
            description={slice === 'passed'
              ? 'Evaluations you pass are recorded here.'
              : 'Accounts appear here once they have challenge rules.'}
          />
        ) : slice === 'funded' ? (
          <table className="prop-table">
            <thead><tr><th>Account</th><th className="num">P&amp;L</th><th className="num">Paid out</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountId}>
                  <td title={r.firmName}>{r.label}</td>
                  <td className={`num jo-trade-val ${signTone(r.pnl)}`}>{money(r.pnl)}</td>
                  <td className="num">{money(r.totalPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : slice === 'evaluation' ? (
          <table className="prop-table">
            <thead><tr><th>Account</th><th className="num">P&amp;L</th><th className="num">To pass</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountId}>
                  <td title={`${r.firmName} · ${PHASE_LABEL[r.phase] || r.phase}`}>{r.label}</td>
                  <td className={`num jo-trade-val ${signTone(r.pnl)}`}>{money(r.pnl)}</td>
                  <td className="num">
                    {r.remainingToPass == null ? '—'
                      : r.targetReached ? <span className="prop-status good">Target met</span>
                        : money(r.remainingToPass)}
                  </td>
                  <td className="prop-row-action">
                    {r.targetReached && <AdvanceButton row={r} onChanged={onChanged} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="prop-table">
            <thead><tr><th>Account</th><th>Started</th><th>Passed</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.challengeId}>
                  <td title={`${r.firmName} · ${PHASE_LABEL[r.phase] || r.phase}`}>{r.label}</td>
                  <td className="num">{r.startDate || '—'}</td>
                  <td className="num">{r.passedDate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
