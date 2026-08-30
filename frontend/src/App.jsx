import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { fetchTrades, fetchAccount, fetchAccounts, fetchPayouts, fetchFees, fetchStrategies, connectSocket, tagTrade, deleteTrade, createManualTrade, fetchNotifications, markNotificationsRead, fetchViewState, saveViewState, fetchMe } from './lib/api.js';
import { useAuth } from './app/AuthContext.jsx';
import { scopeKey, readScopeConfig, defaultConfig, DEFAULT_UNIT, emptyFilters, sanitizeFilters, filterTrades, availableOptions } from './features/filters/filters.js';
import { sanitizeDashLayout, defaultDashLayout, moveDashIdBefore } from './features/dashboard/dashLayout.js';
import { sanitizePropLayout, defaultPropLayout } from './features/prop/propLayout.js';
import { sanitizeBriefPrefs, defaultBriefPrefs } from './features/dashboard/briefPrefs.js';
import { applyBeRounding } from './lib/metrics.js';
import Layout from './app/Layout.jsx';
import Login from './features/auth/Login.jsx';
import ForgotPassword from './features/auth/ForgotPassword.jsx';
import ResetPassword from './features/auth/ResetPassword.jsx';
import VerifyEmail from './features/auth/VerifyEmail.jsx';
import Dashboard from './features/dashboard/Dashboard.jsx';
import TradeLog from './features/trades/TradeLog.jsx';
import Analytics from './features/analytics/Analytics.jsx';
import Strategies from './features/strategies/Strategies.jsx';
import Calendar from './features/calendar/Calendar.jsx';
import Billing from './features/billing/Billing.jsx';
import PropOS from './features/prop/PropOS.jsx';
import Finance from './features/prop/Finance.jsx';
import PropAccounts from './features/prop/PropAccounts.jsx';
import PropChallenges from './features/prop/PropChallenges.jsx';
import Reports from './features/reports/Reports.jsx';
import ComingSoon from './components/ComingSoon.jsx';
import JournalOverview from './features/analytics/JournalOverview.jsx';
import DayView from './features/calendar/DayView.jsx';
import Alerts from './features/alerts/Alerts.jsx';
import Settings from './features/settings/Settings.jsx';
import SettingsAccounts from './features/settings/SettingsAccounts.jsx';
import {
  SettingsAppearance, SettingsPlan, SettingsProfile, SettingsSession, SettingsTrades,
} from './features/settings/SettingsPanels.jsx';
import NewAccountFlow, { FlowIndex } from './features/accounts/NewAccountFlow.jsx';
import WelcomeStep from './features/accounts/steps/WelcomeStep.jsx';
import UploadStep from './features/accounts/steps/UploadStep.jsx';
import DoneStep from './features/accounts/steps/DoneStep.jsx';
import ConnectStep from './features/accounts/steps/ConnectStep.jsx';
import ImportStep from './features/accounts/steps/ImportStep.jsx';
import CapitalStep from './features/accounts/steps/CapitalStep.jsx';
import FirmStep from './features/accounts/steps/FirmStep.jsx';
import AccountStep from './features/accounts/steps/AccountStep.jsx';
import PlatformStep from './features/accounts/steps/PlatformStep.jsx';
import { LEGACY_REDIRECTS } from './app/nav.js';

// The Add Account wizard. A SIBLING of <Layout> on purpose (spec §8.1): eleven
// full-bleed pages with no sidebar and no filter bar, so it cannot nest inside the
// shell — and therefore has no outlet context, which is why accounts, reloadAccounts
// and setAccountId are passed as props.
//
// Returns an ARRAY, not a fragment: both branches spread it into <Routes>, and an
// array of keyed <Route> elements is the shape this file already relies on (see the
// LEGACY_REDIRECTS map). Declared once so the first-run branch (Task 12) cannot
// drift from the onboarded one.
function wizardRoutes({ accounts, reloadAccounts, setAccountId, firstRun, onOnboarded }) {
  return [
    <Route
      key="new-account"
      path="/accounts/new"
      element={
        <NewAccountFlow
          accounts={accounts}
          reloadAccounts={reloadAccounts}
          setAccountId={setAccountId}
          firstRun={firstRun}
          onOnboarded={onOnboarded}
        />
      }
    >
      <Route index element={<FlowIndex />} />
      <Route path="welcome" element={<WelcomeStep />} />
      <Route path="capital" element={<CapitalStep />} />
      <Route path="firm" element={<FirmStep />} />
      <Route path="account" element={<AccountStep />} />
      <Route path="platform" element={<PlatformStep />} />
      <Route path="import" element={<ImportStep />} />
      <Route path="connect" element={<ConnectStep />} />
      <Route path="upload" element={<UploadStep />} />
      <Route path="done" element={<DoneStep />} />
    </Route>,
  ];
}

const ACCT_KEY = 'amey.accountId';   // 'all' or a comma-joined list of mt5 logins (per-device nav state)
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
  /* "STILL LOADING" AND "NOTHING TO SHOW" WERE THE SAME STATE, and they are not the
     same story. `trades` starts as [] and fills in, so a trader whose data is three
     seconds away saw exactly what a brand-new account with no trades sees: an empty
     dashboard telling them they have never traded. Starts true because the first fetch
     is already on its way by the time anything renders. */
  const [tradesLoading, setTradesLoading] = useState(true);
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

  // View state (the selected account, the global display unit, per-scope data
  // filters + widget overrides, and the global trade settings) is stored
  // SERVER-SIDE per user — so it follows the user across browsers/devices
  // instead of sticking to one machine's localStorage. localStorage still
  // mirrors accountId as a fast-paint cache for the first render before the
  // server hydrate lands. Starts at defaults; hydrated from the server on
  // login (below), then any change is debounced up.
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
        // login back to 'all'.) Absent on pre-sync blobs → keep the local one.
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
  const config = { ...defaultConfig(), ...(readScopeConfig(viewConfigs, sk) || {}) };
  // The merge above is shallow, so a config saved before a filter existed brings
  // its own (short) filters object with it — every newer key missing. Rebuilt from
  // the registry on read, which also drops anything malformed.
  const filters = sanitizeFilters(config.filters);
  const pinnedAccounts = config.dashboard?.pinnedAccounts || [];
  // Unlike filters/dashboard, the display unit is global — stored at the top
  // level of viewConfigs, not per scope — so it never changes on an account
  // switch, only on a manual toggle click.
  const unit = viewConfigs.unit || DEFAULT_UNIT;

  const mutateConfig = (fn) => setViewConfigs((prev) => {
    // Reads through the legacy-key fallback so the first edit to the all-accounts
    // scope MIGRATES the old 'god' config forward rather than starting from blank.
    const cur = { ...defaultConfig(), ...(readScopeConfig(prev, sk) || {}) };
    return { ...prev, [sk]: fn(cur) };
  });
  const setUnit = (u) => setViewConfigs((prev) => ({ ...prev, unit: u }));

  /* NO THEME STATE. The app is dark-only as of 2026-08-28 (tokens.css, "NO LIGHT
     THEME"), so there is nothing to hold, nothing to persist and no `data-theme`
     attribute to write — :root IS the theme. A stored `theme: 'light'` left over in a
     user's view state is simply never read; it costs one dead key rather than a
     migration, and it is what a returning light theme would read first. */

  // Dashboard layout — global like `unit`, not per scope, so switching accounts
  // never rearranges the page. Sanitized on read rather than on hydrate so a
  // blob saved before a widget existed still resolves to a complete layout.
  const dashLayout = useMemo(() => sanitizeDashLayout(viewConfigs.dashLayout), [viewConfigs.dashLayout]);
  const mutateDashLayout = (fn) => setViewConfigs((prev) => ({
    ...prev,
    dashLayout: fn(sanitizeDashLayout(prev.dashLayout)),
  }));
  const setDashVisible = (id, visible) => mutateDashLayout((l) => {
    const hidden = { ...l.hidden };
    if (visible) delete hidden[id]; else hidden[id] = true;
    return { ...l, hidden };
  });
  // Addressed by id, not index: the layout editor reorders live during a drag, so
  // an index captured at drag start is stale by the next pointermove.
  const moveDashWidget = (zone, id, targetId) => mutateDashLayout((l) => ({
    ...l,
    [zone]: moveDashIdBefore(l[zone], id, targetId),
  }));
  const resetDashLayout = () => mutateDashLayout(() => defaultDashLayout());

  // Prop OS → Overview layout. Stored beside dashLayout and global for the same
  // reason — and more strongly here, since the Overview spans every account by
  // design and so has no account scope to vary by at all.
  const propLayout = useMemo(() => sanitizePropLayout(viewConfigs.propLayout), [viewConfigs.propLayout]);
  const mutatePropLayout = (fn) => setViewConfigs((prev) => ({
    ...prev,
    propLayout: fn(sanitizePropLayout(prev.propLayout)),
  }));
  const setPropVisible = (id, visible) => mutatePropLayout((l) => {
    const hidden = { ...l.hidden };
    if (visible) delete hidden[id]; else hidden[id] = true;
    return { ...l, hidden };
  });
  const resetPropLayout = () => mutatePropLayout(() => defaultPropLayout());

  // Today's Brief widget preferences — global like the dashboard layout, for the
  // same reason: news filters shouldn't change on an account switch.
  const briefPrefs = useMemo(() => sanitizeBriefPrefs(viewConfigs.briefPrefs), [viewConfigs.briefPrefs]);
  const patchBriefPrefs = (patch) => setViewConfigs((prev) => ({
    ...prev,
    briefPrefs: { ...sanitizeBriefPrefs(prev.briefPrefs), ...patch },
  }));
  const setBriefSection = (id, on) => setViewConfigs((prev) => {
    const cur = sanitizeBriefPrefs(prev.briefPrefs);
    return { ...prev, briefPrefs: { ...cur, sections: { ...cur.sections, [id]: !!on } } };
  });
  const resetBriefPrefs = () => setViewConfigs((prev) => ({ ...prev, briefPrefs: defaultBriefPrefs() }));

  // Patched onto the SANITIZED state, not the raw stored one, so a partial saved
  // blob is normalized by the first edit instead of being written back short.
  const patchFilters = (p) => mutateConfig((c) => ({ ...c, filters: { ...sanitizeFilters(c.filters), ...p } }));
  const clearFilters = () => mutateConfig((c) => ({ ...c, filters: emptyFilters() }));
  // The Dashboard's selected prop account (all-accounts scope), passed as [login].
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
  // The selection is 'all' or a comma-joined list of mt5 logins.
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

  /* Load the user's accounts; drop any logins the selection can no longer name
     (which may be 'all' or a comma-joined list). An emptied selection falls back
     to 'all'.

     ARCHIVED COUNTS AS GONE, and it has to: the server's scope now excludes
     archived accounts, so keeping one selected would 403 every request on the page
     — trades, account, payouts, prop — and leave the trader on a broken screen with
     no control that could fix it (the switcher does not list archived accounts
     either). Archiving the account you are looking at drops you to 'all', which is
     the same thing deleting it has always done. */
  const selectable = (list) => list.filter((a) => a.is_active !== false);

  function reloadAccounts() {
    return fetchAccounts()
      .then((list) => {
        setAccounts(list);
        setAccountIdState((cur) => {
          if (cur === 'all') return cur;
          const live = selectable(list);
          const kept = String(cur).split(',').filter((l) => live.some((a) => String(a.mt5_login) === l));
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

  /* DISMISS ONE, for Today's Brief's Clear button (2026-08-29, Rhea).
   *
   * The route has always taken `{ ids: [...] }` — only `{ all: true }` was ever called.
   * The prototype clears an alert into local component state, which would mean a
   * dismissal that comes back on the next reload and an unread count that disagrees
   * with the list beside it. Marking it read is the same act the notification panel
   * already performs, so one alert cannot be "cleared" here and unread there.
   *
   * OPTIMISTIC, THEN RECONCILED: the row goes immediately (dismissing a warning should
   * not wait on a round trip) and the server's own unread count replaces the local
   * guess when it lands. A failure leaves the alert visible, which is the safe
   * direction for a message about a drawdown. */
  async function markNotificationRead(id) {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      const { unread: u } = await markNotificationsRead({ ids: [id] });
      setUnread(u);
    } catch { /* the row is already gone; the next fetch reconciles */ }
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
  // accounts are known before trusting a specific (non-'all') selection.
  useEffect(() => {
    if (!user) {
      setTrades([]); setAccount(null); setPayouts([]); setFees([]);
      // Not logged in is not "loading" — it is an answer, and the router is about to
      // send them to the login screen anyway.
      setTradesLoading(false);
      return;
    }
    // `selectable`, not `accounts`: an archived login is out of the server's scope,
    // so firing the loads for one would 403 four times before reloadAccounts resets
    // the selection. Waiting is the correct move — the reset is one tick away.
    const live = selectable(accounts);
    const owned = accountId === 'all'
      || String(accountId).split(',').every((l) => live.some((a) => String(a.mt5_login) === l));
    if (!owned) return; // accounts not loaded yet, or selection about to reset
    setLoadError(null);
    setTradesLoading(true);
    // finally, not then: a failed load must stop claiming to be loading, or the page
    // shows a skeleton for ever with the error banner sitting above it.
    fetchTrades(accountId)
      .then(setTrades)
      .catch((e) => setLoadError(e.message))
      .finally(() => setTradesLoading(false));
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
    // Razorpay's webhook is what actually grants a paid plan, so the upgrade
    // lands server-side after checkout closes. Re-read /me instead of making the
    // user reload to see what they just paid for.
    socket.on('plan:updated', () => fetchMe().then(setUser).catch(() => {}));
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

  // Manual trade: owned by the user AND by one of their accounts (required).
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
        {/* Recovery routes. /verify and /reset stay reachable while logged in:
            both are opened from an email, often in a browser that already has a
            session, and bouncing those to the dashboard would strand the link. */}
        <Route path="/forgot" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/verify" element={<VerifyEmail />} />
        {user && !user.onboarded_at ? (
          // First run renders the SAME wizard routes as everyone else (spec §8.2): one
          // route table, one component. It differs in exactly two ways — the `welcome`
          // step exists, and the commit stamps onboarded_at. The old branch mounted a
          // single <Route path="*"> over a self-contained Onboarding page, which
          // swallowed every URL and would fight per-step routing; the catch-all now
          // REDIRECTS into the wizard instead of standing in for it, so a first-run
          // user still cannot escape setup by typing a URL.
          [
            ...wizardRoutes({
              accounts, reloadAccounts, setAccountId, firstRun: true, onOnboarded: setUser,
            }),
            <Route
              key="first-run-catchall"
              path="*"
              element={<Navigate to="/accounts/new/welcome" replace />}
            />,
          ]
        ) : user ? (
          [
            ...wizardRoutes({
              accounts, reloadAccounts, setAccountId, firstRun: false, onOnboarded: setUser,
            }),
            <Route
              key="app-shell"
              element={
              <Layout
                trades={filteredTrades}
                tradesLoading={tradesLoading}
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
                markNotificationRead={markNotificationRead}
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
                dashLayout={dashLayout}
                setDashVisible={setDashVisible}
                moveDashWidget={moveDashWidget}
                resetDashLayout={resetDashLayout}
                propLayout={propLayout}
                setPropVisible={setPropVisible}
                resetPropLayout={resetPropLayout}
                briefPrefs={briefPrefs}
                patchBriefPrefs={patchBriefPrefs}
                setBriefSection={setBriefSection}
                resetBriefPrefs={resetBriefPrefs}
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
              <Route path="finance" element={<Finance />} />
              <Route path="accounts" element={<PropAccounts />} />
              <Route path="challenges" element={<PropChallenges />} />
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
            {/* Settings module. Six sections, six routes, one shell that draws the
                section rail and forwards this Outlet's context down (Settings.jsx).
                The rail is in the PAGE, not the sidebar — nav.js `subnavInPage`. */}
            <Route path="settings" element={<Settings />}>
              <Route index element={<SettingsProfile />} />
              <Route path="plan" element={<SettingsPlan />} />
              <Route path="accounts" element={<SettingsAccounts />} />
              <Route path="trades" element={<SettingsTrades />} />
              <Route path="appearance" element={<SettingsAppearance />} />
              <Route path="session" element={<SettingsSession />} />
            </Route>
            <Route path="billing" element={<Billing />} />

            {/* Legacy flat routes → module routes (kept in sync via nav.js LEGACY_REDIRECTS) */}
            {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
              <Route key={from} path={from.slice(1)} element={<Navigate to={to} replace />} />
            ))}
            </Route>,
          ]
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </div>
  );
}
