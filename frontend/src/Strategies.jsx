import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { fetchStats, createStrategy, updateStrategy, deleteStrategy } from './api.js';
import { fmtVal } from './metrics.js';

const rColor = (r) => (r > 0 ? '#6bd58a' : r < 0 ? '#e0918d' : '#9a9aa2');
// Fallback swatch when a strategy has no color set — stable per name.
const SWATCHES = ['#6ea8fe', '#6bd58a', '#e0b96b', '#c58af9', '#e0918d', '#5fd4c4', '#e79bc8', '#8fb0e8'];
const swatchFor = (name, color) => color || SWATCHES[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % SWATCHES.length];

// Per-strategy performance card (R-native by default; $ in a single account).
function StrategyCard({ name, color, perf, unit }) {
  const p = perf || { trades: 0, sr: null, r: 0, wins: 0, losses: 0, breakeven: 0 };
  return (
    <div className="strat-card">
      <div className="strat-card-head">
        <span className="strat-dot" style={{ background: swatchFor(name, color) }} />
        <span className="strat-name">{name}</span>
      </div>
      {p.trades === 0 ? (
        <div className="strat-empty">No trades tagged yet</div>
      ) : (
        <div className="strat-stats">
          <div><span className="strat-stat-v" style={{ color: rColor(p.r) }}>{fmtVal(p.r, unit)}</span><span className="strat-stat-l">{unit === 'USD' ? 'P&L' : 'Total R'}</span></div>
          <div><span className="strat-stat-v">{p.sr == null ? '—' : `${p.sr}%`}</span><span className="strat-stat-l">Strike</span></div>
          <div><span className="strat-stat-v">{p.trades}</span><span className="strat-stat-l">Trades</span></div>
        </div>
      )}
      {p.trades > 0 && (
        <div className="strat-wl">{p.wins}W · {p.losses}L · {p.breakeven}BE</div>
      )}
    </div>
  );
}

// One row in the manage list: rename inline, recolor, archive/restore, delete.
function ManageRow({ s, onSaved, onError }) {
  const [name, setName] = useState(s.name);
  const [color, setColor] = useState(s.color || swatchFor(s.name, null));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = name.trim() !== s.name || color !== (s.color || swatchFor(s.name, null));

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await onSaved(); } catch (e) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={`strat-row ${s.is_active ? '' : 'archived'}`}>
      <input type="color" className="strat-color" value={color} onChange={(e) => setColor(e.target.value)} disabled={busy} />
      <input className="strat-row-name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      {dirty && (
        <button className="strat-btn primary" disabled={busy || !name.trim()}
          onClick={() => run(() => updateStrategy(s.id, { name: name.trim(), color }))}>Save</button>
      )}
      <button className="strat-btn" disabled={busy}
        onClick={() => run(() => updateStrategy(s.id, { is_active: !s.is_active }))}>
        {s.is_active ? 'Archive' : 'Restore'}
      </button>
      {confirmDelete ? (
        <>
          <span className="strat-del-q">Delete?</span>
          <button className="strat-btn danger" disabled={busy} onClick={() => run(() => deleteStrategy(s.id))}>Yes</button>
          <button className="strat-btn" disabled={busy} onClick={() => setConfirmDelete(false)}>No</button>
        </>
      ) : (
        <button className="strat-btn danger-link" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>
      )}
    </div>
  );
}

export default function Strategies() {
  const {
    strategies = [], reloadStrategies, reloadTrades,
    connected, toggleSidebar, accountId = 'all', unit = 'R', filters, tradeSettings = {},
  } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const beRound = !!tradeSettings.beRounding;
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    fetchStats(accountId, unit, filters, beRound).then(setStats).catch((e) => setErr(e.message));
  }, [accountId, unit, filterKey, beRound]);

  // Merge the catalog with per-strategy performance (bySetup is keyed by name).
  const perfByName = useMemo(() => {
    const m = new Map();
    for (const g of stats?.bySetup || []) m.set(g.key, g);
    return m;
  }, [stats]);

  // Strategies actually traded but not in the catalog (e.g. legacy/imported setups).
  const unmanaged = useMemo(() => {
    const known = new Set(strategies.map((s) => s.name));
    return (stats?.bySetup || []).filter((g) => g.key && !known.has(g.key));
  }, [stats, strategies]);

  const active = strategies.filter((s) => s.is_active);
  const archived = strategies.filter((s) => !s.is_active);

  async function refresh() {
    await reloadStrategies();
    await reloadTrades?.();
    fetchStats(accountId, unit, filters, beRound).then(setStats).catch(() => {});
  }

  async function addStrategy(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setErr(null);
    try {
      await createStrategy({ name });
      setNewName('');
      await reloadStrategies();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setAdding(false);
    }
  }

  const page = (body) => (
    <div className="page">
      <PageHeader title="Strategies" connected={connected} onMenu={toggleSidebar} />
      <div className="page-body">{body}</div>
    </div>
  );

  return page(
    <>
      {err && <div className="banner error">{err}</div>}

      <form className="strat-add" onSubmit={addStrategy}>
        <input placeholder="New strategy name (e.g. Breakout, ORB, Liq-run)"
          value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
        <button type="submit" disabled={adding || !newName.trim()}>{adding ? 'Adding…' : '+ Add strategy'}</button>
      </form>

      {/* Performance cards — R-native (or $ in a single account) */}
      <h3 className="strat-h">Performance {unit === 'USD' ? '($)' : '(R)'}</h3>
      {active.length === 0 && unmanaged.length === 0 ? (
        <div className="strat-empty-page">No strategies yet — add one above, then tag trades with it.</div>
      ) : (
        <div className="strat-grid">
          {active.map((s) => (
            <StrategyCard key={s.id} name={s.name} color={s.color} perf={perfByName.get(s.name)} unit={unit} />
          ))}
          {unmanaged.map((g) => (
            <StrategyCard key={`u-${g.key}`} name={g.key} color="#6f6f78" perf={g} unit={unit} />
          ))}
        </div>
      )}

      {/* Manage catalog */}
      <h3 className="strat-h">Manage</h3>
      <div className="panel strat-manage">
        {active.map((s) => <ManageRow key={s.id} s={s} onSaved={refresh} onError={setErr} />)}
        {archived.length > 0 && <div className="strat-arch-label">Archived</div>}
        {archived.map((s) => <ManageRow key={s.id} s={s} onSaved={refresh} onError={setErr} />)}
        {strategies.length === 0 && <div className="strat-empty">No strategies in your catalog yet.</div>}
      </div>
    </>
  );
}
