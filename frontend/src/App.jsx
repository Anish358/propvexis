import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { fetchTrades, fetchAccount, fetchAccounts, connectSocket, tagTrade, deleteTrade } from './api.js';
import { useAuth } from './AuthContext.jsx';
import Layout from './Layout.jsx';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import TradeLog from './TradeLog.jsx';
import Analytics from './Analytics.jsx';
import Calendar from './Calendar.jsx';

const ACCT_KEY = 'amey.accountId'; // 'all' (god) or a specific mt5_login

export default function App() {
  const { user, loading } = useAuth();
  const [trades, setTrades] = useState([]);
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
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

  // Load trades + account snapshot for the selected scope. Waits until accounts
  // are known before trusting a specific (non-god) selection.
  useEffect(() => {
    if (!user) { setTrades([]); setAccount(null); return; }
    const owned = accountId === 'all' || accounts.some((a) => String(a.mt5_login) === String(accountId));
    if (!owned) return; // accounts not loaded yet, or selection about to reset
    setLoadError(null);
    fetchTrades(accountId).then(setTrades).catch((e) => setLoadError(e.message));
    fetchAccount(accountId).then(setAccount).catch(() => {});
  }, [user, accountId, accounts]);

  // One socket per session. Handlers read the live selection via ref so we don't
  // reconnect on every account switch.
  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(
      (trade) => {
        // A trade from an account we don't know yet = a pending account just
        // auto-bound on its first trade — refresh the account list.
        if (!accountsRef.current.some((a) => String(a.mt5_login) === String(trade.account_id))) {
          reloadAccounts();
        }
        if (inView(trade.account_id)) { upsertLocal(trade); flash(trade.id); }
      },
      (trade) => { if (inView(trade.account_id)) upsertLocal(trade); },
    );
    socket.on('account:updated', () => fetchAccount(accountIdRef.current).then(setAccount).catch(() => {}));
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
                trades={trades}
                account={account}
                accounts={accounts}
                accountId={accountId}
                setAccountId={setAccountId}
                reloadAccounts={reloadAccounts}
                connected={connected}
                flashId={flashId}
                saveTrade={saveTrade}
                removeTrade={removeTrade}
              />
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="trades" element={<TradeLog />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="calendar" element={<Calendar />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </div>
  );
}
