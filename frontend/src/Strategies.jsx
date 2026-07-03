import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import StrategyRulesModal from './StrategyRulesModal.jsx';
import { fetchStats, createStrategy, updateStrategy, deleteStrategy } from './api.js';
import { fmtVal } from './metrics.js';

const rColor = (r) => (r > 0 ? '#6bd58a' : r < 0 ? '#e0918d' : '#9a9aa2');
const MIN_TRADES = 5; // don't draw conclusions from tiny samples

// Edge-Finder-style insights synthesized from the scope's stats. Pure, guarded
// on sample size so it never over-claims from a handful of trades.
function deriveInsights(bySetup = [], adh = [], unit = 'R') {
  const out = [];
  const traded = bySetup.filter((g) => g.key && g.trades >= MIN_TRADES);
  if (traded.length) {
    const best = [...traded].sort((a, b) => (b.r / b.trades) - (a.r / a.trades))[0];
    if (best.r > 0) out.push({ tone: 'good', text: `Your strongest edge is ${best.key} — ${fmtVal(best.r / best.trades, unit)} per trade over ${best.trades} trades.` });
    const worst = [...traded].sort((a, b) => a.r - b.r)[0];
    if (worst && worst.r < 0 && worst.key !== best.key) out.push({ tone: 'bad', text: `Biggest leak: ${worst.key} at ${fmtVal(worst.r, unit)} across ${worst.trades} trades — consider tightening or dropping it.` });
  }
  const gaps = (adh || []).filter((a) => a.followed > 0 && a.broken > 0)
    .map((a) => ({ ...a, gap: a.rFollowed - a.rBroken })).sort((a, b) => b.gap - a.gap);
  if (gaps.length && gaps[0].gap > 0) {
    const g = gaps[0];
    out.push({ tone: 'good', text: `Discipline pays on ${g.key}: ${fmtVal(g.rFollowed, unit)} following your rules vs ${fmtVal(g.rBroken, unit)} when you break them.` });
  }
  const lowAdh = (adh || []).filter((a) => a.assessed >= MIN_TRADES && a.adherence != null)
    .sort((a, b) => a.adherence - b.adherence)[0];
  if (lowAdh && lowAdh.adherence < 100) out.push({ tone: 'bad', text: `${lowAdh.key} has your lowest discipline: ${lowAdh.adherence}% rule-adherence over ${lowAdh.assessed} assessed trades.` });
  return out.slice(0, 4);
}
// Fallback swatch when a strategy has no color set — stable per name.
const SWATCHES = ['#6ea8fe', '#6bd58a', '#e0b96b', '#c58af9', '#e0918d', '#5fd4c4', '#e79bc8', '#8fb0e8'];
const swatchFor = (name, color) => color || SWATCHES[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % SWATCHES.length];

// Per-strategy performance card (R-native by default; $ in a single account).
// `adh` (when the strategy has rules) contrasts rule-followed vs rule-broken.
function StrategyCard({ name, color, perf, adh, unit }) {
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
      {adh && adh.assessed > 0 && (
        <div className="strat-adh">
          <div className="strat-adh-bar" title={`${adh.followed} followed · ${adh.broken} broke rules`}>
            <span className="strat-adh-fill" style={{ width: `${adh.adherence}%` }} />
          </div>
          <div className="strat-adh-legend">
            <span className="strat-adh-pct">{adh.adherence}% rule-adherence</span>
            <span>✓ {fmtVal(adh.rFollowed, unit)} · ✗ <span style={{ color: rColor(adh.rBroken) }}>{fmtVal(adh.rBroken, unit)}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

// One row in the manage list: rename inline, recolor, edit rules, archive/restore, delete.
function ManageRow({ s, onSaved, onError, onEditRules }) {
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
      <button className={`strat-btn ${s.rules?.length ? 'has-rules' : ''}`} disabled={busy}
        onClick={() => onEditRules(s)} title="Objective rules checked from your MT5 data">
        Rules{s.rules?.length ? ` (${s.rules.length})` : ''}
      </button>
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
  const [rulesFor, setRulesFor] = useState(null);
  const [compareSel, setCompareSel] = useState([]);
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

  // Adherence rows keyed by strategy name (only strategies that define rules).
  const adhByName = useMemo(() => {
    const m = new Map();
    for (const a of stats?.adherence?.byStrategy || []) m.set(a.key, a);
    return m;
  }, [stats]);
  const adhOverall = stats?.adherence?.overall;

  const insights = useMemo(
    () => deriveInsights(stats?.bySetup, stats?.adherence?.byStrategy, unit),
    [stats, unit],
  );

  // Strategies with trades, available to compare side-by-side.
  const comparable = useMemo(() => (stats?.bySetup || []).filter((g) => g.key), [stats]);
  // Seed the comparison with the most-traded strategies the first time stats load.
  useEffect(() => {
    if (comparable.length && compareSel.length === 0) {
      setCompareSel([...comparable].sort((a, b) => b.trades - a.trades).slice(0, 3).map((g) => g.key));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparable.length]);
  const toggleCompare = (name) =>
    setCompareSel((sel) => (sel.includes(name) ? sel.filter((n) => n !== name) : [...sel, name]));
  const compareCols = compareSel.map((name) => ({
    name, perf: perfByName.get(name), adh: adhByName.get(name),
  }));

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

      {/* Edge-Finder insights */}
      {insights.length > 0 && (
        <div className="strat-insights">
          {insights.map((ins, i) => (
            <div key={i} className={`strat-insight ${ins.tone}`}>
              <span className="strat-insight-icon">{ins.tone === 'good' ? '▲' : '▼'}</span>
              <span>{ins.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rule-adherence summary — only when some strategy has rules + assessed trades */}
      {adhOverall && adhOverall.assessed > 0 && (
        <div className="panel strat-adh-summary">
          <div className="strat-adh-sum-head">
            <span className="strat-adh-sum-pct">{adhOverall.adherence}%</span>
            <span className="strat-adh-sum-l">rule-adherence across {adhOverall.assessed} assessed trade{adhOverall.assessed === 1 ? '' : 's'}</span>
          </div>
          <div className="strat-adh-sum-split">
            <div className="strat-adh-sum-col">
              <div className="strat-adh-sum-tag ok">Followed rules ({adhOverall.followed})</div>
              <div className="strat-adh-sum-v" style={{ color: rColor(adhOverall.rFollowed) }}>{fmtVal(adhOverall.rFollowed, unit)}</div>
              <div className="strat-adh-sum-sub">{adhOverall.srFollowed == null ? '—' : `${adhOverall.srFollowed}% SR`} · exp {fmtVal(adhOverall.expFollowed, unit)}</div>
            </div>
            <div className="strat-adh-sum-col">
              <div className="strat-adh-sum-tag bad">Broke rules ({adhOverall.broken})</div>
              <div className="strat-adh-sum-v" style={{ color: rColor(adhOverall.rBroken) }}>{fmtVal(adhOverall.rBroken, unit)}</div>
              <div className="strat-adh-sum-sub">{adhOverall.srBroken == null ? '—' : `${adhOverall.srBroken}% SR`} · exp {fmtVal(adhOverall.expBroken, unit)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Performance cards — R-native (or $ in a single account) */}
      <h3 className="strat-h">Performance {unit === 'USD' ? '($)' : '(R)'}</h3>
      {active.length === 0 && unmanaged.length === 0 ? (
        <div className="strat-empty-page">No strategies yet — add one above, then tag trades with it.</div>
      ) : (
        <div className="strat-grid">
          {active.map((s) => (
            <StrategyCard key={s.id} name={s.name} color={s.color} perf={perfByName.get(s.name)} adh={adhByName.get(s.name)} unit={unit} />
          ))}
          {unmanaged.map((g) => (
            <StrategyCard key={`u-${g.key}`} name={g.key} color="#6f6f78" perf={g} unit={unit} />
          ))}
        </div>
      )}

      {/* A/B comparison */}
      {comparable.length >= 2 && (
        <>
          <h3 className="strat-h">Compare</h3>
          <div className="panel strat-compare">
            <div className="strat-compare-pick">
              {comparable.map((g) => (
                <button key={g.key} type="button"
                  className={`rule-chip ${compareSel.includes(g.key) ? 'on' : ''}`}
                  onClick={() => toggleCompare(g.key)}>{g.key}</button>
              ))}
            </div>
            {compareCols.length > 0 && (
              <div className="grid-wrap">
                <table className="strat-compare-tbl">
                  <thead>
                    <tr><th></th>{compareCols.map((c) => <th key={c.name}>{c.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    <tr><td>Trades</td>{compareCols.map((c) => <td key={c.name} className="num">{c.perf?.trades ?? 0}</td>)}</tr>
                    <tr><td>{unit === 'USD' ? 'P&L' : 'Total R'}</td>{compareCols.map((c) => <td key={c.name} className="num" style={{ color: rColor(c.perf?.r) }}>{fmtVal(c.perf?.r, unit)}</td>)}</tr>
                    <tr><td>Strike rate</td>{compareCols.map((c) => <td key={c.name} className="num">{c.perf?.sr == null ? '—' : `${c.perf.sr}%`}</td>)}</tr>
                    <tr><td>Expectancy</td>{compareCols.map((c) => <td key={c.name} className="num">{c.perf?.trades ? fmtVal(c.perf.r / c.perf.trades, unit) : '—'}</td>)}</tr>
                    <tr><td>Rule-adherence</td>{compareCols.map((c) => <td key={c.name} className="num">{c.adh?.adherence == null ? '—' : `${c.adh.adherence}%`}</td>)}</tr>
                    <tr><td>R following rules</td>{compareCols.map((c) => <td key={c.name} className="num">{c.adh?.assessed ? fmtVal(c.adh.rFollowed, unit) : '—'}</td>)}</tr>
                    <tr><td>R breaking rules</td>{compareCols.map((c) => <td key={c.name} className="num">{c.adh?.assessed ? fmtVal(c.adh.rBroken, unit) : '—'}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Manage catalog */}
      <h3 className="strat-h">Manage</h3>
      <div className="panel strat-manage">
        {active.map((s) => <ManageRow key={s.id} s={s} onSaved={refresh} onError={setErr} onEditRules={setRulesFor} />)}
        {archived.length > 0 && <div className="strat-arch-label">Archived</div>}
        {archived.map((s) => <ManageRow key={s.id} s={s} onSaved={refresh} onError={setErr} onEditRules={setRulesFor} />)}
        {strategies.length === 0 && <div className="strat-empty">No strategies in your catalog yet.</div>}
      </div>

      {rulesFor && (
        <StrategyRulesModal strategy={rulesFor} onClose={() => setRulesFor(null)} onSaved={refresh} />
      )}
    </>
  );
}
