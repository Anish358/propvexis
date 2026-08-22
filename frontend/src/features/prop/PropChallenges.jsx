import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button, CountBadge, EmptyState, LoadingBlock, Tabs } from '@/components/primitives';
import PageHeader from '../../app/PageHeader.jsx';
import { AccountFormModal } from '../accounts/AccountForms.jsx';
import { fetchPropHistory, fetchPropPortfolio } from '../../lib/api.js';
import ChallengeCard from './ChallengeCard.jsx';
import ChallengeDetails from './ChallengeDetails.jsx';
import { selectedLogin } from './propAccounts.js';
import { onlyPropCapital } from './propAccounts.js';
import {
  ALL_FIRMS, CHALLENGE_TABS, challengeCounts, challengeRows, firmOptions, groupByFirm,
} from './challengesData.js';

// ---------------------------------------------------------------------------
// Prop OS › Challenges — the challenge module. Two tabs, one route.
//
//   Challenges  the MULTI-challenge workspace, organised PROP FIRM → CHALLENGES.
//   Details     the SINGLE-challenge lifecycle: Phase 1 → Phase 2 → Funded.
//
// WHY THIS IS NOT ANOTHER ACCOUNTS PAGE, since both list the same accounts. Accounts
// asks "which account needs me, and how is it performing?" and answers with drawdown
// meters, an equity curve and a trade history. Challenges asks "how is this challenge
// progressing toward funding?" and answers with the phase journey. Same rows, two
// different questions, and the pages are kept apart on purpose — merging them would
// produce one page that answers neither question first.
//
// ONE ROUTE, NOT TWO, following the pattern the module already uses: Accounts switches
// Portfolio/Details this way and Finance switches its three views this way — the `Tabs`
// primitive plus local state. The IA in nav.js has Challenges as one page, and adding
// /prop/challenges/details would put a navigation decision somewhere the IA does not
// describe.
//
// HIERARCHY IS PRESERVED IN BOTH FIRM VIEWS. "All" does not flatten into one grid of
// every challenge: it renders one section per firm, in the same order the selector
// lists them, because a trader's mental model of eight challenges is "three at FTMO,
// two at Topstep..." and a flat grid throws that away. Picking a firm narrows to that
// firm's section. The firms come from the accounts themselves — there is no hardcoded
// firm list on this page.
//
// ONE SOURCE OF TRUTH FOR THE SELECTION. Choosing a challenge card does not set local
// `selected` state — it writes `setAccountId`, the app-wide selection the top bar's
// universal switcher owns, and flips to Details. So the two ways of choosing are the
// same action, and the choice survives a reload because App syncs it server-side.
//
// ONE FETCH DRIVES THE GRID (GET /api/prop/portfolio: every owned account's live rule
// state), and Details reads its entry out of that same payload, so a card and the
// lifecycle it opens can never show different numbers for the same challenge. Details
// adds exactly one request of its own — GET /api/prop/history for the selected account
// — because per-phase dates and re-take counts are the one thing the portfolio payload
// does not carry, and fetching them per card would be N requests for a grid.
// ---------------------------------------------------------------------------

export default function PropChallenges() {
  const {
    connected, toggleSidebar, accounts: allAccounts = [], accountId = 'all', setAccountId, reloadAccounts,
  } = useOutletContext();
  // The outlet context carries every account (the switcher needs live ones too),
  // so Prop OS filters for itself — a live account has no challenge to report on.
  const accounts = useMemo(() => onlyPropCapital(allAccounts), [allAccounts]);

  const [tab, setTab] = useState('challenges');
  const [firm, setFirm] = useState(ALL_FIRMS);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [history, setHistory] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  // Reloaded on an account switch as well as on mount, for the same reason the
  // Accounts page does it: the route is portfolio-wide by design (it ignores
  // ?account_id), so this is a freshness trigger rather than a re-scope.
  useEffect(() => {
    let live = true;
    setErr(null);
    fetchPropPortfolio()
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [accountId, accounts.length]);

  const login = selectedLogin(accountId);

  // The selected challenge's phase history — the dates and re-take counts behind the
  // lifecycle. Reset to null (not []) on every change of account, because null means
  // "not loaded" and [] would mean "this account has no challenge rows", and the
  // lifecycle draws those two differently: an unknown history infers a passed phase
  // from the current one, an empty one reports that the phase never ran.
  useEffect(() => {
    setHistory(null);
    if (login == null) return undefined;
    let live = true;
    fetchPropHistory(login)
      .then((rows) => { if (live) setHistory(rows); })
      .catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [login]);

  const rows = useMemo(
    () => challengeRows({ states: data?.states, accounts }),
    [data, accounts],
  );
  const groups = useMemo(() => groupByFirm(rows), [rows]);
  const firms = useMemo(() => firmOptions(groups), [groups]);

  // A firm the trader no longer has challenges at cannot stay selected — its tab is
  // gone from the row, and a selection pointing at nothing would render an empty page
  // with no way back to a full one.
  useEffect(() => {
    if (firm !== ALL_FIRMS && !groups.some((g) => g.key === firm)) setFirm(ALL_FIRMS);
  }, [firm, groups]);

  // Selecting a challenge IS switching the app's account scope — see the header.
  const select = (accountLogin) => {
    setAccountId(String(accountLogin));
    setTab('details');
  };

  const selectedState = useMemo(
    () => (login == null ? null : (data?.states || []).find((s) => String(s.account_id) === String(login)) || null),
    [data, login],
  );
  const selectedRow = useMemo(
    () => (login == null ? null : rows.find((r) => String(r.accountId) === String(login)) || null),
    [rows, login],
  );
  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.mt5_login) === String(login)) || null,
    [accounts, login],
  );

  // Counts sit in the selector because "how many challenges do I have at this firm?"
  // is a question the control can answer without being clicked. CountBadge is the
  // app's count primitive; a number typed into the label would be a second one.
  const firmTabs = firms.map((f) => ({
    value: f.value,
    label: (
      <>
        {f.label}
        <CountBadge className="pa-tab-count">{f.count}</CountBadge>
      </>
    ),
  }));

  const shown = firm === ALL_FIRMS ? groups : groups.filter((g) => g.key === firm);

  // ---- Challenges tab ----

  const section = (group) => {
    const counts = challengeCounts(group.rows);
    return (
      <section className="pc-firm" key={group.key}>
        <div className="pc-firm-head">
          <h3 className="pc-firm-name">{group.name}</h3>
          <span className="pc-firm-count">
            {counts.breached === 0
              ? `${counts.total} active challenge${counts.total === 1 ? '' : 's'}`
              : `${counts.total} challenge${counts.total === 1 ? '' : 's'} · ${counts.breached} breached`}
          </span>
        </div>
        <div className="pc-grid">
          {group.rows.map((r) => (
            <ChallengeCard key={r.accountId} row={r} onSelect={() => select(r.accountId)} />
          ))}
        </div>
      </section>
    );
  };

  const challenges = (
    <>
      <Tabs className="pc-firms" tabs={firmTabs} value={firm} onChange={setFirm} />
      {shown.length === 0 ? (
        <EmptyState
          title="No challenges yet"
          description="A challenge appears here once one of your prop accounts carries challenge rules — a phase, a profit target and its drawdown limits."
          actions={<Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>Start New Challenge</Button>}
        />
      ) : shown.map(section)}
    </>
  );

  // ---- Details tab ----

  // Details needs exactly one challenge. `accountId` is 'all' or a comma-joined list,
  // so anything that is not a single login lands here rather than the page guessing
  // which of several was meant. The switcher is forced to single-select while this page
  // is open (nav.js SINGLE_ACCOUNT_ROUTES), so this is a first-visit state rather than
  // one a trader gets stuck in.
  const details = login == null ? (
    <EmptyState
      title="No challenge selected"
      description="Pick a challenge from the Challenges tab, or choose its account in the switcher at the top of the page."
    />
  ) : !selectedState || selectedState.challenge === null ? (
    <EmptyState
      title="No challenge on this account"
      description="Details tracks one challenge through Phase 1, Phase 2 and Funded. Add challenge rules to this account to give it a lifecycle to follow."
    />
  ) : (
    <ChallengeDetails
      state={selectedState}
      account={selectedAccount}
      stages={selectedRow?.stages}
      history={history}
    />
  );

  return (
    <div className="page">
      <PageHeader
        title="Challenges"
        connected={connected}
        onMenu={toggleSidebar}
        right={(
          // THE ENTRY POINT ONLY. Buying a challenge from a firm happens on the firm's
          // own site, and PropVexis has no checkout, no marketplace and no purchase
          // backend — so this opens the app's EXISTING account flow, where picking a
          // firm and a size pre-fills that challenge's rules from the template catalog
          // (propFirms.js). That is what starting to track a new challenge already
          // means here; a button that simulated a purchase would be inventing a product.
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" />
            <span>Start New Challenge</span>
          </Button>
        )}
      />
      <div className="page-body">
        <Tabs className="pa-tabs" tabs={CHALLENGE_TABS} value={tab} onChange={setTab} />
        {err ? (
          <div className="banner error">Could not load your challenges: {err}</div>
        ) : !data ? (
          <LoadingBlock label="Loading your challenges" />
        ) : tab === 'challenges' ? challenges : details}
      </div>
      {addOpen && (
        <AccountFormModal
          mode="add"
          onClose={() => setAddOpen(false)}
          onSaved={reloadAccounts}
        />
      )}
    </div>
  );
}
