import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { fetchTrades, fetchAccount, fetchAccounts, fetchPayouts, fetchStrategies, connectSocket, tagTrade, deleteTrade, createManualTrade } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { scopeKey, defaultConfig, emptyFilters, filterTrades, availableOptions } from './filters.js';
import { applyBeRounding } from './metrics.js';
import Layout from './Layout.jsx';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import TradeLog from './TradeLog.jsx';
import Analytics from './Analytics.jsx';
import Strategies from './Strategies.jsx';
import Calendar from './Calendar.jsx';
import Billing from './Billing.jsx';

const ACCT_KEY = 'amey.accountId';   // 'all' (god) or a specific mt5_login
const VIEWCFG_KEY = 'amey.viewConfigs'; // per-scope { unit, filters } map
const TRADE_SETTINGS_KEY = 'amey.tradeSettings'; // global journal settings (BE rounding, columns)
const defaultTradeSettings = () => ({ beRounding: false, columns: {} });

export default function App() {
  const { user, loading } = useAuth();
  const [trades, setTrades] = useState([]);
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [strategies, setStrategies] = useState([]);
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

  // Per-scope view config (display unit + data filters), persisted. The active
  // scope is the god view or the selected account.
  const [viewConfigs, setViewConfigs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VIEWCFG_KEY)) || {}; } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem(VIEWCFG_KEY, JSON.stringify(viewConfigs)); }, [viewConfigs]);

  // Global journal settings (not per-scope): breakeven rounding + trade-log
  // column visibility. Persisted; merged over defaults so older stored blobs load.
  const [tradeSettings, setTradeSettings] = useState(() => {
    try { return { ...defaultTradeSettings(), ...(JSON.parse(localStorage.getItem(TRADE_SETTINGS_KEY)) || {}) }; }
    catch { return defaultTradeSettings(); }
  });
  useEffect(() => { localStorage.setItem(TRADE_SETTINGS_KEY, JSON.stringify(tradeSettings)); }, [tradeSettings]);
  const setBeRounding = (on) => setTradeSettings((s) => ({ ...s, beRounding: !!on }));
  const setColumnVisible = (id, visible) => setTradeSettings((s) => ({ ...s, columns: { ...s.columns, [id]: visible } }));
  const resetColumns = () => setTradeSettings((s) => ({ ...s, columns: {} }));

  const sk = scopeKey(accountId);
  // Merge over defaults so configs persisted before a field existed (e.g. the
  // pre-widget Phase A configs) still get sane values.
  const config = { ...defaultConfig(accountId), ...(viewConfigs[sk] || {}) };
  const { unit, filters } = config;
  const widgetOverrides = config.widgets?.overrides || {};

  const mutateConfig = (fn) => setViewConfigs((prev) => {
    const cur = { ...defaultConfig(accountId), ...(prev[sk] || {}) };
    return { ...prev, [sk]: fn(cur) };
  });
  const setUnit = (u) => mutateConfig((c) => ({ ...c, unit: u }));
  const patchFilters = (p) => mutateConfig((c) => ({ ...c, filters: { ...c.filters, ...p } }));
  const clearFilters = () => mutateConfig((c) => ({ ...c, filters: emptyFilters() }));
  // Explicit per-scope widget choice; absent ids fall back to the widget default.
  const setWidgetVisible = (id, visible) => mutateConfig((c) => ({
    ...c, widgets: { ...c.widgets, overrides: { ...(c.widgets?.overrides || {}), [id]: visible } },
  }));
  const resetWidgets = () => mutateConfig((c) => ({ ...c, widgets: { overrides: {} } }));

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

  // does an incoming socket event belong to the account currently in view?
  const inView = (acctId) => {
    const sel = accountIdRef.current;
    return sel === 'all' || String(acctId) === String(sel);
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

  // Load the user's accounts; drop a stale selection that isn't owned.
  function reloadAccounts() {
    return fetchAccounts()
      .then((list) => {
        setAccounts(list);
        setAccountIdState((cur) =>
          cur === 'all' || list.some((a) => String(a.mt5_login) === String(cur)) ? cur : 'all'
        );
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

  // Reload payouts for the active scope (funded-account withdrawals).
  function reloadPayouts() {
    return fetchPayouts(accountIdRef.current).then(setPayouts).catch(() => {});
  }

  // Re-fetch trades for the active scope. Exposed so a strategy rename (which
  // cascades to trades.setup on the server) can refresh the in-memory set.
  function reloadTrades() {
    return fetchTrades(accountIdRef.current).then(setTrades).catch(() => {});
  }

  // Load trades + account snapshot + payouts for the selected scope. Waits until
  // accounts are known before trusting a specific (non-god) selection.
  useEffect(() => {
    if (!user) { setTrades([]); setAccount(null); setPayouts([]); return; }
    const owned = accountId === 'all' || accounts.some((a) => String(a.mt5_login) === String(accountId));
    if (!owned) return; // accounts not loaded yet, or selection about to reset
    setLoadError(null);
    fetchTrades(accountId).then(setTrades).catch((e) => setLoadError(e.message));
    fetchAccount(accountId).then(setAccount).catch(() => {});
    fetchPayouts(accountId).then(setPayouts).catch(() => {});
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
        {user ? (
          <Route
            element={
              <Layout
                trades={filteredTrades}
                account={account}
                accounts={accounts}
                payouts={payouts}
                reloadPayouts={reloadPayouts}
                strategies={strategies}
                reloadStrategies={reloadStrategies}
                reloadTrades={reloadTrades}
                accountId={accountId}
                setAccountId={setAccountId}
                reloadAccounts={reloadAccounts}
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
                widgetOverrides={widgetOverrides}
                setWidgetVisible={setWidgetVisible}
                resetWidgets={resetWidgets}
                tradeSettings={tradeSettings}
                setBeRounding={setBeRounding}
                setColumnVisible={setColumnVisible}
                resetColumns={resetColumns}
              />
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="trades" element={<TradeLog />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="strategies" element={<Strategies />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="billing" element={<Billing />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </div>
  );
}
