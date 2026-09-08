import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { CountBadge, EmptyState, LoadingBlock, Tabs } from '@/components/primitives';
import PageHeader from '../../app/PageHeader.jsx';
import { fetchPropPortfolio } from '../../lib/api.js';
import AccountPortfolioCard, { PassedAccountCard } from './AccountPortfolioCard.jsx';
import AccountWorkspace from './AccountWorkspace.jsx';
import {
  ACCOUNT_TABS, PORTFOLIO_TABS, bucketAccounts, onlyPropCapital, selectedLogin,
} from './propAccounts.js';

// ---------------------------------------------------------------------------
// Prop OS › Accounts — the account module. Two tabs, one route.
//
//   Portfolio  the MULTI-account view: every account as a card, grouped by the
//              status it is actually in, with a Select action on each.
//   Details    the SINGLE-account workspace for whichever account is selected.
//
// ONE ROUTE, NOT TWO, and that follows the app's established pattern rather than
// being a shortcut: Finance switches its three views the same way (Tabs plus local
// state), and the Overview's Accounts card switches its three slices the same way
// again. The IA in nav.js has Accounts as one page; adding /prop/accounts/details
// would put a navigation decision in a place the IA does not describe.
//
// ONE SOURCE OF TRUTH FOR THE SELECTED ACCOUNT. Selecting a card does not set some
// local `selected` state — it writes to `setAccountId`, the app-wide selection the
// top bar's universal switcher owns, and then flips to Details. So the two ways of
// choosing an account are the same action, the trades and filters below follow
// automatically (App already scopes them by that value), and the choice survives a
// reload because App syncs it server-side with the rest of the view state.
//
// THE OPEN TAB IS IN THE URL (`?tab=details`), not in local state, because the tab
// is a destination other surfaces send a trader to: the dashboard's Account Health
// card links "View account" straight at this account's Details. A link cannot reach
// a useState, so the alternatives were a second route the IA does not describe, or
// router state that a reload throws away. A search param is neither — the page still
// owns one route, and the URL now says which of its two views is open, so the link
// works, the back button works, and a reload lands where it left off. Portfolio is
// the default, so it writes no param and the bare /prop/accounts URL is unchanged.
//
// ONE FETCH DRIVES BOTH TABS. GET /api/prop/portfolio returns every owned
// account's live rule state, so Details reads the entry it needs out of the same
// payload the cards were built from. A separate per-account fetch would let a card
// and the workspace it opens show different numbers for the same account, for as
// long as the two requests were apart.
// ---------------------------------------------------------------------------

export default function PropAccounts() {
  const {
    connected, toggleSidebar, accounts: allAccounts = [], accountId = 'all', setAccountId,
    trades = [], tradeSettings = {},
  } = useOutletContext();
  // The outlet context carries every account (the switcher needs live ones too),
  // so Prop OS filters for itself — a live account has no challenge to report on.
  const accounts = useMemo(() => onlyPropCapital(allAccounts), [allAccounts]);

  /* replace:true — flipping between two views of one page is not a navigation
     step worth a history entry; Back should return to wherever the trader came
     from (often the dashboard), not to the other tab. */
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'details' ? 'details' : 'portfolio';
  const setTab = (value) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value === 'details') next.set('tab', 'details');
    else next.delete('tab');
    return next;
  }, { replace: true });
  const [slice, setSlice] = useState('evaluation');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  // Reloaded on an account switch as well as on mount. The route ignores
  // ?account_id (it is portfolio-wide by design), so this is a freshness trigger,
  // not a re-scope: switching accounts is the moment a trader is most likely to be
  // looking at figures that moved since the page opened.
  useEffect(() => {
    let live = true;
    setErr(null);
    fetchPropPortfolio()
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [accountId, accounts.length]);

  const buckets = useMemo(
    () => bucketAccounts({ states: data?.states, passed: data?.passed, accounts }),
    [data, accounts],
  );

  // Selecting a card IS switching the app's account scope — see the header.
  const select = (login) => {
    setAccountId(String(login));
    setTab('details');
  };

  const login = selectedLogin(accountId);
  const selectedState = useMemo(
    () => (login == null ? null : (data?.states || []).find((s) => String(s.account_id) === String(login)) || null),
    [data, login],
  );
  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.mt5_login) === String(login)) || null,
    [accounts, login],
  );

  // Counts sit in the tab labels because the answer to "where are my accounts?"
  // is often the count itself — an empty sub-tab is worth knowing about before
  // clicking it. CountBadge is the app's count primitive; a bare number typed into
  // the label would be a second one.
  const sliceTabs = PORTFOLIO_TABS.map((t) => ({
    value: t.value,
    label: (
      <>
        {t.label}
        <CountBadge className="pa-tab-count">{buckets[t.value].length}</CountBadge>
      </>
    ),
  }));

  const rows = buckets[slice] || [];
  const sliceLabel = PORTFOLIO_TABS.find((t) => t.value === slice)?.label.toLowerCase();

  const portfolio = (
    <>
      <Tabs className="pa-slices" tabs={sliceTabs} value={slice} onChange={setSlice} />
      {rows.length === 0 ? (
        <EmptyState
          title={`No ${sliceLabel} accounts`}
          description={slice === 'passed'
            ? 'Evaluations you pass are recorded here, one entry per pass.'
            : slice === 'breached'
              ? 'An account shows up here when it breaks its daily or max drawdown rule.'
              : 'Accounts appear here once they have challenge rules.'}
        />
      ) : (
        <div className="pa-grid">
          {slice === 'passed'
            ? rows.map((r) => (
              <PassedAccountCard key={r.challengeId} row={r} onSelect={() => select(r.accountId)} />
            ))
            : rows.map((r) => (
              <AccountPortfolioCard key={r.accountId} row={r} onSelect={() => select(r.accountId)} />
            ))}
        </div>
      )}
    </>
  );

  // Details needs exactly one account. `accountId` is 'all' or a comma-joined
  // list, so anything that is not a single login lands here rather than the page
  // guessing which of several was meant. The switcher is forced to single-select
  // while this page is open (see nav.js SINGLE_ACCOUNT_ROUTES), so this is the
  // first-visit state, not a state a trader gets stuck in.
  const details = login == null ? (
    <EmptyState
      title="No account selected"
      description="Pick an account from Portfolio, or choose one in the account switcher at the top of the page."
    />
  ) : !selectedState ? (
    <EmptyState
      title="No challenge rules on this account"
      description="Details tracks an account against its prop-firm rules. Add challenge rules to this account to see its drawdown, target and trading-day state."
    />
  ) : (
    <AccountWorkspace
      data={selectedState}
      account={selectedAccount}
      trades={trades}
      beRounding={!!tradeSettings.beRounding}
    />
  );

  return (
    <div className="page">
      <PageHeader title="Accounts" connected={connected} onMenu={toggleSidebar} />
      <div className="page-body">
        <Tabs className="pa-tabs" tabs={ACCOUNT_TABS} value={tab} onChange={setTab} />
        {err ? (
          <div className="banner error">Could not load your accounts: {err}</div>
        ) : !data ? (
          <LoadingBlock label="Loading your accounts" />
        ) : tab === 'portfolio' ? portfolio : details}
      </div>
    </div>
  );
}
