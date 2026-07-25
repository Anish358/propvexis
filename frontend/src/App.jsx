import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { fetchTrades, fetchAccount, fetchAccounts, fetchPayouts, fetchFees, fetchStrategies, connectSocket, tagTrade, deleteTrade, createManualTrade, fetchNotifications, markNotificationsRead, fetchViewState, saveViewState } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { scopeKey, defaultConfig, emptyFilters, filterTrades, availableOptions } from './filters.js';
import { applyBeRounding } from './metrics.js';
import Layout from './Layout.jsx';
import Login from './Login.jsx';
import Onboarding from './Onboarding.jsx';
import Dashboard from './Dashboard.jsx';
import TradeLog from './TradeLog.jsx';
import Analytics from './Analytics.jsx';
import Strategies from './Strategies.jsx';
import Calendar from './Calendar.jsx';
import Billing from './Billing.jsx';
import PropOS, { PropFinance } from './PropOS.jsx';
import Reports from './Reports.jsx';
import ComingSoon from './ComingSoon.jsx';
import JournalOverview from './JournalOverview.jsx';
import DayView from './DayView.jsx';
import Alerts from './Alerts.jsx';
import Settings from './Settings.jsx';
import Account from './Account.jsx';
import { LEGACY_REDIRECTS } from './nav.js';

const ACCT_KEY = 'amey.accountId';   // 'all' (god) or a specific mt5_login (per-device nav state)
const defaultTradeSettings = () => ({ beRounding: false, columns: {} });

// Legacy localStorage keys (view state now lives server-side). Read once on the
// first post-upgrade login to seed the server, then cleared.
const LEGACY_VIEWCFG_KEY = 'amey.viewConfigs';
const LEGACY_TRADE_SETTINGS_KEY = 'amey.tradeSettings';
function readLegacyViewState() {
  try {
    const viewConfigs = JSON.parse(localStorage.getItem(LEGACY_VIEWCFG_KEY)) || null;
    const tradeSettings = JSON.parse(localStorage.getItem(LEGACY_TRADE_SETTINGS_KEY)) || null;
    return viewConfigs || tradeSettings ? { viewConfigs, tradeSettings } : null;
  } catch { return null; }
}
function clearLegacyViewState() {
  try { localStorage.removeItem(LEGACY_VIEWCFG_KEY); localStorage.removeItem(LEGACY_TRADE_SETTINGS_KEY); } catch { /* ignore */ }
}

export default function App() {
  const { user, loading, setUser } = useAuth();
  const [trades, setTrades] = useState([]);
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [fees, setFees] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);
  const [accountId, setAccountIdState] = useState(() => localStorage.getItem(ACCT_KEY) || 'all');
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const flashTimer = useRef(null);
  const accountIdRef = useRef(accountId);
  useEffect(() => { accountIdRef.current = accountId; }, [accountId]);

  function setAccountId(id) {
    localStorage.setItem(ACCT_KEY, id);
    setAccountIdState(id);
  }

  // View state (the selected account, per-scope display unit + data filters +
  // widget overrides, and the global trade settings) is stored SERVER-SIDE per user
  // — so it follows the user across browsers/devices instead of sticking to one
  // machine's localStorage. localStorage still mirrors accountId as a fast-paint
  // cache for the first render before the server hydrate lands. Starts at defaults;
  // hydrated from the server on login (below), then any change is debounced up.
  const [viewConfigs, setViewConfigs] = useState({});
  const [tradeSettings, setTradeSettings] = useState(defaultTradeSettings);
  const viewStateLoaded = useRef(false); // gate saves until the initial hydrate lands
  const saveTimer = useRef(null);

  // Hydrate view state from the server on login; reset it on logout. One-time
  // migration: if the server has nothing yet but this browser holds the old
  // localStorage blobs, adopt them (the save effect then pushes them up) and clear
  // the legacy keys — so upgrading users keep their current filters/prefs once.
  useEffect(() => {
    if (!user) { viewStateLoaded.current = false; setViewConfigs({}); setTradeSettings(defaultTradeSettings()); return undefined; }
    let cancelled = false;
    fetchViewState()
      .then((state) => {
        if (cancelled) return;
        const hasServer = state && Object.keys(state).length > 0;
        const legacy = hasServer ? null : readLegacyViewState();
        setViewConfigs((hasServer ? state.viewConfigs : legacy?.viewConfigs) || {});
        setTradeSettings({ ...defaultTradeSettings(), ...((hasServer ? state.tradeSettings : legacy?.tradeSettings) || {}) });
        // Server-synced selected account wins over this device's cached one.
        // (Ownership is re-validated by the accounts loader, which drops a stale
        // login back to god view.) Absent on pre-sync blobs → keep the local one.
        if (hasServer && state.accountId != null) setAccountId(String(state.accountId));
        if (legacy) clearLegacyViewState();
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) viewStateLoaded.current = true; });
    return () => { cancelled = true; };
  }, [user]);

  // Persist (debounced) whenever the synced state changes — but only AFTER the
  // initial hydrate, so we never clobber the saved state with startup defaults.
  useEffect(() => {
    if (!user || !viewStateLoaded.current) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveViewState({ accountId, viewConfigs, tradeSettings }).catch(() => {});
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [user, accountId, viewConfigs, tradeSettings]);

  const setBeRounding = (on) => setTradeSettings((s) => ({ ...s, beRounding: !!on }));
  const setColumnVisible = (id, visible) => setTradeSettings((s) => ({ ...s, columns: { ...s.columns, [id]: visible } }));
  const resetColumns = () => setTradeSettings((s) => ({ ...s, columns: {} }));

  const sk = scopeKey(accountId);
  // Merge over defaults so configs persisted before a field existed (e.g. the
  // pre-widget Phase A configs) still get sane values.
  const config = { ...defaultConfig(accountId), ...(viewConfigs[sk] || {}) };
  const { unit, filters } = config;
  const pinnedAccounts = config.dashboard?.pinnedAccounts || [];

  const mutateConfig = (fn) => setViewConfigs((prev) => {
    const cur = { ...defaultConfig(accountId), ...(prev[sk] || {}) };
    return { ...prev, [sk]: fn(cur) };
  });
  const setUnit = (u) => mutateConfig((c) => ({ ...c, unit: u }));
  const patchFilters = (p) => mutateConfig((c) => ({ ...c, filters: { ...c.filters, ...p } }));
  const clearFilters = () => mutateConfig((c) => ({ ...c, filters: emptyFilters() }));
  // The Dashboard's selected prop account (god scope), passed as [login].
  const setPinnedAccounts = (logins) => mutateConfig((c) => ({ ...c, dashboard: { ...c.dashboard, pinnedAccounts: logins } }));

  // Precision control snaps near-zero Fixed R to breakeven BEFORE filtering, so
  // outcome filters + every in-memory page/metric see the same classification.
  const normalizedTrades = useMemo(
    () => applyBeRounding(trades, tradeSettings.beRounding),
    [trades, tradeSettings.beRounding],
  );
  // Filters apply to every component: the in-memory pages read the filtered set;
  // the dropdown choices come from the full (unfiltered) scoped trades.
  const filteredTrades = useMemo(() => filterTrades(normalizedTrades, filters, unit, tradeSettings.beRounding), [normalizedTrades, filters, unit, tradeSettings.beRounding]);
  const filterOptions = useMemo(() => availableOptions(trades), [trades]);

  // does an incoming socket event belong to the account(s) currently in view?
  // The selection is 'all' (god) or a comma-joined list of mt5 logins.
  const inView = (acctId) => {
    const sel = accountIdRef.current;
    return sel === 'all' || String(sel).split(',').includes(String(acctId));
  };

  function upsertLocal(trade) {
    setTrades((prev) => {
      const others = prev.filter((t) => t.id !== trade.id);
      const next = [trade, ...others];
      next.sort((a, b) => new Date(b.close_time) - new Date(a.close_time));
      return next;
    });
  }

  function removeLocal(id) {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }

  function flash(id) {
    setFlashId(id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 2000);
  }

  const accountsRef = useRef([]);
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);

  // Load the user's accounts; drop any stale logins from the selection (which may
  // be 'all' or a comma-joined list). An emptied selection falls back to god view.
  function reloadAccounts() {
    return fetchAccounts()
      .then((list) => {
        setAccounts(list);
        setAccountIdState((cur) => {
          if (cur === 'all') return cur;
          const kept = String(cur).split(',').filter((l) => list.some((a) => String(a.mt5_login) === l));
          return kept.length ? kept.join(',') : 'all';
        });
        return list;
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!user) { setAccounts([]); return; }
    reloadAccounts();
  }, [user]);

  // The strategy catalog is user-scoped (spans all accounts), so load it once per
  // session. reloadStrategies is passed down so the Strategies page can refresh
  // after a create/rename/delete.
  function reloadStrategies() {
    return fetchStrategies().then(setStrategies).catch(() => {});
  }
  useEffect(() => {
    if (!user) { setStrategies([]); return; }
    reloadStrategies();
  }, [user]);

  // In-app notifications: load the feed on login, then keep it live via the socket
  // ('notification:new' below). Toasts are transient and auto-dismiss.
  function reloadNotifications() {
    return fetchNotifications()
      .then((r) => { setNotifications(r.notifications); setUnread(r.unread); })
      .catch(() => {});
  }
  useEffect(() => {
    if (!user) { setNotifications([]); setUnread(0); setToasts([]); return; }
    reloadNotifications();
  }, [user]);

  function pushToast(n) {
    const key = ++toastSeq.current;
    setToasts((prev) => [...prev, { key, severity: n.severity, title: n.title, body: n.body }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.key !== key)), 6000);
  }
  const dismissToast = (key) => setToasts((prev) => prev.filter((t) => t.key !== key));

  async function markAllNotificationsRead() {
    try {
      const { unread: u } = await markNotificationsRead({ all: true });
      setUnread(u);
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    } catch { /* ignore */ }
  }

  // Reload payouts for the active scope (funded-account withdrawals).
  function reloadPayouts() {
    return fetchPayouts(accountIdRef.current).then(setPayouts).catch(() => {});
  }

  // Reload fees (eval/reset/activation) for the active scope.
  function reloadFees() {
    return fetchFees(accountIdRef.current).then(setFees).catch(() => {});
  }

  // Re-fetch trades for the active scope. Exposed so a strategy rename (which
  // cascades to trades.setup on the server) can refresh the in-memory set.
  function reloadTrades() {
    return fetchTrades(accountIdRef.current).then(setTrades).catch(() => {});
  }

  // Load trades + account snapshot + payouts for the selected scope. Waits until
  // accounts are known before trusting a specific (non-god) selection.
  useEffect(() => {
    if (!user) { setTrades([]); setAccount(null); setPayouts([]); setFees([]); return; }
    const owned = accountId === 'all'
      || String(accountId).split(',').every((l) => accounts.some((a) => String(a.mt5_login) === l));
    if (!owned) return; // accounts not loaded yet, or selection about to reset
    setLoadError(null);
    fetchTrades(accountId).then(setTrades).catch((e) => setLoadError(e.message));
    fetchAccount(accountId).then(setAccount).catch(() => {});
    fetchPayouts(accountId).then(setPayouts).catch(() => {});
    fetchFees(accountId).then(setFees).catch(() => {});
  }, [user, accountId, accounts]);

  // One socket per session. Handlers read the live selection via ref so we don't
  // reconnect on every account switch.
  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(
      (trade) => {
        // A trade from an account-linked login we don't know yet = a pending
        // account just auto-bound on its first trade — refresh the account list.
        if (trade.account_id != null &&
            !accountsRef.current.some((a) => String(a.mt5_login) === String(trade.account_id))) {
          reloadAccounts();
        }
        if (inView(trade.account_id)) { upsertLocal(trade); flash(trade.id); }
      },
      (trade) => { if (inView(trade.account_id)) upsertLocal(trade); },
    );
    socket.on('account:updated', () => fetchAccount(accountIdRef.current).then(setAccount).catch(() => {}));
    socket.on('payout:updated', () => reloadPayouts());
    socket.on('fee:updated', () => reloadFees());
    socket.on('notification:new', (n) => {
      setNotifications((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, 100));
      setUnread((u) => u + 1);
      pushToast(n);
    });
    socket.on('trade:deleted', ({ id }) => removeLocal(id));
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => socket.close();
  }, [user]);

  async function saveTrade(id, fields) {
    const updated = await tagTrade(id, fields);
    upsertLocal(updated);
  }

  async function removeTrade(id) {
    await deleteTrade(id);
    removeLocal(id);
  }

  // Manual strategy trade (god view only): account-less, owned by the user.
  async function addManualTrade(fields) {
    const created = await createManualTrade(fields);
    upsertLocal(created);
    flash(created.id);
    return created;
  }

  if (loading) {
    return <div className="app-splash">Loading…</div>;
  }

  return (
    <div className="app">
      {loadError && user && <div className="banner error">Could not reach backend: {loadError}</div>}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Login mode="signup" />} />
        {user && !user.onboarded_at ? (
          // First-run users are routed to the setup wizard for every path until
          // it's completed; completing it sets onboarded_at and re-renders here.
          <Route path="*" element={<Onboarding onDone={setUser} />} />
        ) : user ? (
          <Route
            element={
              <Layout
                trades={filteredTrades}
                account={account}
                accounts={accounts}
                payouts={payouts}
                reloadPayouts={reloadPayouts}
                fees={fees}
                reloadFees={reloadFees}
                strategies={strategies}
                reloadStrategies={reloadStrategies}
                reloadTrades={reloadTrades}
                accountId={accountId}
                setAccountId={setAccountId}
                reloadAccounts={reloadAccounts}
                notifications={notifications}
                unread={unread}
                markAllNotificationsRead={markAllNotificationsRead}
                toasts={toasts}
                dismissToast={dismissToast}
                connected={connected}
                flashId={flashId}
                saveTrade={saveTrade}
                removeTrade={removeTrade}
                addManualTrade={addManualTrade}
                unit={unit}
                filters={filters}
                filterOptions={filterOptions}
                setUnit={setUnit}
                patchFilters={patchFilters}
                clearFilters={clearFilters}
                pinnedAccounts={pinnedAccounts}
                setPinnedAccounts={setPinnedAccounts}
                tradeSettings={tradeSettings}
                setBeRounding={setBeRounding}
                setColumnVisible={setColumnVisible}
                resetColumns={resetColumns}
              />
            }
          >
            <Route index element={<Dashboard />} />

            {/* Trade Journal module (IA in nav.js) */}
            <Route path="journal">
              <Route index element={<JournalOverview />} />
              <Route path="trades" element={<TradeLog />} />
              <Route path="day" element={<DayView />} />
              <Route path="progress" element={<ComingSoon title="Progress Tracker" blurb="A day-grid heatmap of your trading consistency over the year." />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="psychology" element={<ComingSoon title="Psychology Journal" blurb="Log emotions and decision quality alongside your trades." />} />
            </Route>

            {/* Prop OS module */}
            <Route path="prop">
              <Route index element={<PropOS />} />
              <Route path="finance" element={<PropFinance />} />
              <Route path="accounts" element={<ComingSoon title="Prop Accounts" blurb="Accounts grouped by stage — Evaluation, Funded and Breached." />} />
              <Route path="challenges" element={<ComingSoon title="Challenges" blurb="Challenge history and phase timelines per account." />} />
              <Route path="analytics" element={<ComingSoon title="Prop Analytics" blurb="ROI progression, finance breakdown, passing and breach insights." />} />
            </Route>

            <Route path="strategies" element={<Strategies />} />
            <Route path="backtesting" element={<ComingSoon title="Backtesting" blurb="Test strategies against historical data before risking capital." />} />

            {/* Tools module */}
            <Route path="tools">
              <Route path="lot-calculator" element={<ComingSoon title="Lot Calculator" blurb="Work out position size from account risk, stop-loss and entry price." />} />
              <Route path="news-calendar" element={<ComingSoon title="News Calendar" blurb="Upcoming high-impact economic events." />} />
            </Route>

            <Route path="alerts" element={<Alerts />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="account" element={<Account />} />
            <Route path="billing" element={<Billing />} />

            {/* Legacy flat routes → module routes (kept in sync via nav.js LEGACY_REDIRECTS) */}
            {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
              <Route key={from} path={from.slice(1)} element={<Navigate to={to} replace />} />
            ))}
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </div>
  );
}
