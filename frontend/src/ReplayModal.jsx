import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  LineStyle,
  CrosshairMode,
} from 'lightweight-charts';
import { fetchReplay } from './api.js';

// Trade replay: candlestick playback of one trade. M1 bars come from the backend
// (sourced from the broker's own history via the EA); we aggregate them to the
// chosen timeframe client-side, reveal them bar-by-bar for the "replay" effect,
// and overlay entry/exit markers + SL/TP price lines.

// Selectable timeframes, in minutes. M1 is what's stored; the rest aggregate.
const TIMEFRAMES = [
  { label: 'M1', min: 1 },
  { label: 'M5', min: 5 },
  { label: 'M15', min: 15 },
  { label: 'H1', min: 60 },
];
const SPEEDS = [1, 2, 4, 8];
const BASE_MS = 650; // ms per bar at 1x

// Palette pulled from the app's design tokens (styles.css :root).
const COLORS = {
  up: '#39d98a',
  down: '#e0615b',
  entry: '#c9c9d2',
  sl: '#e0615b',
  tp: '#39d98a',
};

// Aggregate ascending M1 bars ([{t,o,h,l,c}]) into `min`-minute candles, bucketed
// on the UTC clock (so M5 aligns to :00/:05, etc). Returns chart-ready bars with
// `time` in epoch seconds (what lightweight-charts consumes).
function aggregate(m1, min) {
  if (!m1.length) return [];
  if (min === 1) return m1.map((b) => ({ time: Math.floor(b.t), open: b.o, high: b.h, low: b.l, close: b.c }));
  const span = min * 60;
  const out = [];
  let cur = null;
  for (const b of m1) {
    const bucket = Math.floor(b.t / span) * span;
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: b.o, high: b.h, low: b.l, close: b.c };
    } else {
      cur.high = Math.max(cur.high, b.h);
      cur.low = Math.min(cur.low, b.l);
      cur.close = b.c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Index of the last bar at or before a given epoch-second time (the bar that
// "contains" that moment). -1 if the time precedes all bars.
function idxAtTime(bars, t) {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= t) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

const fmtBarTime = (t) =>
  t == null ? '—' : new Date(t * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
);

export default function ReplayModal({ trade, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tf, setTf] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [cursor, setCursor] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const markersRef = useRef(null);
  const pollRef = useRef(null);

  const available = data?.available ?? false;
  const pending = data?.pending ?? false;
  const m1 = data?.candles ?? [];
  const bars = useMemo(() => aggregate(m1, tf), [m1, tf]);
  const ready = available && bars.length > 0;

  const openSec = data ? Math.floor(new Date(data.trade.open_time).getTime() / 1000) : 0;
  const closeSec = data ? Math.floor(new Date(data.trade.close_time).getTime() / 1000) : 0;
  const entryIdx = useMemo(() => Math.max(0, idxAtTime(bars, openSec)), [bars, openSec]);
  const isBuy = data?.trade.direction === 'buy';
  const win = data ? (isBuy ? data.trade.exit_price > data.trade.entry_price : data.trade.exit_price < data.trade.entry_price) : false;

  // Entry/exit markers, aligned to the aggregated bars they fall in.
  const markers = useMemo(() => {
    if (!bars.length || !data) return { entry: null, exit: null };
    const eBar = bars[idxAtTime(bars, openSec)] || bars[0];
    const xBar = bars[idxAtTime(bars, closeSec)] || bars[bars.length - 1];
    return {
      entry: {
        time: eBar.time,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: COLORS.entry,
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: 'Entry',
      },
      exit: {
        time: xBar.time,
        position: isBuy ? 'aboveBar' : 'belowBar',
        color: win ? COLORS.tp : COLORS.sl,
        shape: isBuy ? 'arrowDown' : 'arrowUp',
        text: 'Exit',
      },
    };
  }, [bars, data, openSec, closeSec, isBuy, win]);

  // ---- Fetch replay data, re-polling while the EA is still delivering candles.
  //      After ~1 min with no candles we stop and show a clear message + Retry,
  //      rather than spinning forever (the EA may be offline or not yet on v1.13).
  const MAX_POLLS = 15; // × 4s ≈ 1 min
  useEffect(() => {
    if (!trade) return undefined;
    let alive = true;
    let tries = 0;
    async function load() {
      try {
        const d = await fetchReplay(trade.id);
        if (!alive) return;
        setData(d);
        setLoading(false);
        if (d.available && d.pending) {
          if (tries < MAX_POLLS) {
            tries += 1;
            pollRef.current = setTimeout(load, 4000);
          } else {
            setGaveUp(true); // candles never arrived — stop waiting
          }
        }
      } catch (e) {
        if (alive) { setError(e.message); setLoading(false); }
      }
    }
    setLoading(true); setData(null); setError(null); setCursor(0); setPlaying(false); setGaveUp(false);
    load();
    return () => { alive = false; clearTimeout(pollRef.current); };
  }, [trade?.id, reloadKey]);

  // ---- Close on Escape; space toggles play/pause.
  useEffect(() => {
    if (!trade) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ' && ready) { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'ArrowRight') setCursor((c) => Math.min(c + 1, bars.length - 1));
      if (e.key === 'ArrowLeft') setCursor((c) => Math.max(c - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [trade, onClose, ready, bars.length]);

  // ---- Create the chart once candles are ready. Price lines (entry/SL/TP) are
  //      set here since they don't change within a modal instance.
  useEffect(() => {
    if (!ready || !containerRef.current) return undefined;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: '#0f0f13' }, textColor: '#8a8a93', fontSize: 11 },
      grid: { vertLines: { color: '#1c1c22' }, horzLines: { color: '#1c1c22' } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#2a2a30', rightOffset: 4 },
      rightPriceScale: { borderColor: '#2a2a30' },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up, downColor: COLORS.down, borderVisible: false,
      wickUpColor: COLORS.up, wickDownColor: COLORS.down,
    });
    const t = data.trade;
    const line = (price, color, title, style = LineStyle.Solid) =>
      price != null && series.createPriceLine({ price: Number(price), color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
    line(t.entry_price, COLORS.entry, 'Entry', LineStyle.Dashed);
    line(t.sl_price, COLORS.sl, 'SL');
    line(t.tp_price, COLORS.tp, 'TP');

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; markersRef.current = null; };
  }, [ready]);

  // Data always spans the WHOLE window: revealed bars carry OHLC, later bars are
  // whitespace ({time} only). This keeps the time axis fixed so playback fills a
  // stable frame instead of rescaling every bar (the lightweight-charts replay
  // pattern). `upto` = last bar index to show as a real candle.
  const paint = (s, upto) =>
    s.setData(bars.map((b, i) => (i <= upto ? b : { time: b.time })));

  // ---- New timeframe / freshly-arrived candles: fit the full window once, then
  //      rewind to the entry bar (context visible) and pause.
  useEffect(() => {
    const s = seriesRef.current; const chart = chartRef.current;
    if (!s || !chart || !bars.length) return;
    paint(s, entryIdx);
    chart.timeScale().fitContent();
    setPlaying(false);
    setCursor(entryIdx);
  }, [bars]);

  // ---- Reveal bars up to the cursor + show markers once their bar is reached.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || !bars.length) return;
    paint(s, cursor);
    const lastT = bars[cursor]?.time ?? -Infinity;
    const ms = [];
    if (markers.entry && markers.entry.time <= lastT) ms.push(markers.entry);
    if (markers.exit && markers.exit.time <= lastT) ms.push(markers.exit);
    markersRef.current?.setMarkers(ms);
  }, [cursor, bars, markers]);

  // ---- Playback tick.
  useEffect(() => {
    if (!playing) return undefined;
    if (cursor >= bars.length - 1) { setPlaying(false); return undefined; }
    const id = setTimeout(() => setCursor((c) => Math.min(c + 1, bars.length - 1)), BASE_MS / speed);
    return () => clearTimeout(id);
  }, [playing, cursor, speed, bars.length]);

  if (!trade) return null;

  const atEnd = cursor >= bars.length - 1;
  const curTime = bars[cursor]?.time;
  const sym = data?.trade.symbol || trade.symbol_base || trade.symbol;

  return (
    <div className="rp-backdrop" onClick={onClose}>
      <div className="rp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Trade replay">
        <header className="rp-head">
          <div className="rp-title">
            <h3>{sym} <span className="rp-sub">Replay</span></h3>
            {data && (
              <span className={`rp-dir ${isBuy ? 'long' : 'short'}`}>{isBuy ? 'LONG' : 'SHORT'}</span>
            )}
          </div>
          <div className="rp-tf">
            {TIMEFRAMES.map((f) => (
              <button
                key={f.min}
                className={`rp-tf-btn ${tf === f.min ? 'on' : ''}`}
                onClick={() => setTf(f.min)}
                disabled={!ready}
              >{f.label}</button>
            ))}
          </div>
          <button className="rp-x" onClick={onClose} title="Close">✕</button>
        </header>

        <div className="rp-body">
          {loading && <div className="rp-state">Loading replay…</div>}

          {!loading && error && <div className="rp-state error">Couldn’t load replay: {error}</div>}

          {!loading && !error && !available && (
            <div className="rp-state">
              <p>Replay isn’t available for this trade.</p>
              <p className="muted">{data?.reason || 'It has no price/time data to chart (imported or manual entry).'}</p>
            </div>
          )}

          {!loading && !error && available && !ready && !gaveUp && (
            <div className="rp-state">
              <div className="rp-spinner" />
              <p>Waiting for candles from the EA…</p>
              <p className="muted">
                {pending
                  ? 'The window is queued — bars appear here within a few seconds once the MT5 terminal delivers them.'
                  : 'No candles are available for this window yet.'}
              </p>
            </div>
          )}

          {!loading && !error && available && !ready && gaveUp && (
            <div className="rp-state">
              <p>No candles arrived for this trade.</p>
              <p className="muted">
                Replay bars are supplied by the MT5 Expert Advisor. The terminal may be
                offline, or running an EA version that predates replay — update it to the
                latest AmeyJournal EA and keep it running, then retry.
              </p>
              <button className="rp-retry" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
            </div>
          )}

          {ready && <div className="rp-chart" ref={containerRef} />}

          {ready && (
            <>
              <div className="rp-legend">
                <span><i className="dot" style={{ background: COLORS.entry }} /> Entry {data.trade.entry_price}</span>
                {data.trade.sl_price != null && <span><i className="dot" style={{ background: COLORS.sl }} /> SL {data.trade.sl_price}</span>}
                {data.trade.tp_price != null && <span><i className="dot" style={{ background: COLORS.tp }} /> TP {data.trade.tp_price}</span>}
                <span className="rp-clock">{fmtBarTime(curTime)}</span>
              </div>

              <input
                className="rp-scrub"
                type="range"
                min={0}
                max={Math.max(bars.length - 1, 0)}
                value={cursor}
                onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
              />

              <div className="rp-controls">
                <button className="rp-btn" title="Restart at entry" onClick={() => { setPlaying(false); setCursor(entryIdx); }}>⟲</button>
                <button className="rp-btn" title="Step back" onClick={() => { setPlaying(false); setCursor((c) => Math.max(c - 1, 0)); }}>‹</button>
                <button
                  className="rp-btn play"
                  title={playing ? 'Pause' : 'Play'}
                  onClick={() => { if (atEnd) setCursor(entryIdx); setPlaying((p) => !p); }}
                >{playing ? <PauseIcon /> : <PlayIcon />}</button>
                <button className="rp-btn" title="Step forward" onClick={() => { setPlaying(false); setCursor((c) => Math.min(c + 1, bars.length - 1)); }}>›</button>
                <span className="rp-speeds">
                  {SPEEDS.map((s) => (
                    <button key={s} className={`rp-speed ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>
                  ))}
                </span>
                <span className="rp-progress">Bar {Math.min(cursor + 1, bars.length)} / {bars.length}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
