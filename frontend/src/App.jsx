import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { fetchTrades, fetchAccount, connectSocket, tagTrade, deleteTrade } from './api.js';
import Layout from './Layout.jsx';
import Dashboard from './Dashboard.jsx';
import TradeLog from './TradeLog.jsx';
import Analytics from './Analytics.jsx';
import Calendar from './Calendar.jsx';

export default function App() {
  const [trades, setTrades] = useState([]);
  const [account, setAccount] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const flashTimer = useRef(null);

  // merge a trade into state (insert or replace), newest-first by close_time
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

  useEffect(() => {
    fetchTrades().then(setTrades).catch((e) => setLoadError(e.message));
    fetchAccount().then(setAccount).catch(() => {});
    const socket = connectSocket(
      (trade) => { upsertLocal(trade); flash(trade.id); },  // trade:upserted
      (trade) => upsertLocal(trade),                         // trade:updated
    );
    socket.on('account:updated', setAccount);
    socket.on('trade:deleted', ({ id }) => removeLocal(id));
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => socket.close();
  }, []);

  async function saveTrade(id, fields) {
    const updated = await tagTrade(id, fields);
    upsertLocal(updated);
  }

  async function removeTrade(id) {
    await deleteTrade(id);
    removeLocal(id);
  }

  return (
    <div className="app">
      {loadError && <div className="banner error">Could not reach backend: {loadError}</div>}
      <Routes>
        <Route element={<Layout trades={trades} account={account} connected={connected} flashId={flashId} saveTrade={saveTrade} removeTrade={removeTrade} />}>
          <Route index element={<Dashboard />} />
          <Route path="trades" element={<TradeLog />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="calendar" element={<Calendar />} />
        </Route>
      </Routes>
    </div>
  );
}
