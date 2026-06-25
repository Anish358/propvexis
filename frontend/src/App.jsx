import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTrades, tagTrade, connectSocket } from './api.js';
import TradesTable from './TradesTable.jsx';
import TagModal from './TagModal.jsx';
import Dashboard from './Dashboard.jsx';

export default function App() {
  const [trades, setTrades] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('trades');
  const flashTimer = useRef(null);

  // merge a trade into state (insert or replace), keeping newest-first by close_time
  function upsertLocal(trade) {
    setTrades((prev) => {
      const others = prev.filter((t) => t.id !== trade.id);
      const next = [trade, ...others];
      next.sort((a, b) => new Date(b.close_time) - new Date(a.close_time));
      return next;
    });
  }

  function flash(id) {
    setFlashId(id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 2000);
  }

  useEffect(() => {
    fetchTrades().then(setTrades).catch((e) => setLoadError(e.message));

    const socket = connectSocket(
      (trade) => { upsertLocal(trade); flash(trade.id); },   // trade:upserted
      (trade) => { upsertLocal(trade); }                      // trade:updated
    );
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => socket.close();
  }, []);

  async function handleSave(id, fields) {
    const updated = await tagTrade(id, fields);
    upsertLocal(updated);
  }

  const untagged = useMemo(() => trades.filter((t) => !t.tagged).length, [trades]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Patil <span>TRADES</span></div>
        <nav className="nav">
          <button className={view === 'trades' ? 'on' : ''} onClick={() => setView('trades')}>Trades</button>
          <button className={view === 'dashboard' ? 'on' : ''} onClick={() => setView('dashboard')}>Dashboard</button>
        </nav>
        <div className="stats">
          <span className="stat">{trades.length} trades</span>
          {untagged > 0 && <span className="stat warn">{untagged} to tag</span>}
          <span className={`conn ${connected ? 'on' : 'off'}`}>
            {connected ? 'live' : 'offline'}
          </span>
        </div>
      </header>

      {loadError && <div className="banner error">Could not reach backend: {loadError}</div>}

      {view === 'trades' ? (
        <TradesTable trades={trades} onRowClick={setSelected} highlightId={flashId} />
      ) : (
        <Dashboard />
      )}

      <TagModal trade={selected} onClose={() => setSelected(null)} onSave={handleSave} />
    </div>
  );
}
