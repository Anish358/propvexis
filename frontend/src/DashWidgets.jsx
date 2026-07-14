import React from 'react';
import { token } from './theme.js';

const GREEN = token('--accent');
const RED = '#e0615b';
const TRACK = '#23232a';

// Semicircle gauge (0..1) — used for Trade Win %.
export function GaugeArc({ value, size = 84 }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  // semicircle from 180deg (left) to 0deg (right)
  const pt = (frac) => {
    const a = Math.PI - Math.PI * frac;
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const [sx, sy] = pt(0);
  const [ex, ey] = pt(1);
  const [vx, vy] = pt(v);
  return (
    <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke={TRACK} strokeWidth="6" strokeLinecap="round" />
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${v > 0.5 ? 1 : 0} 1 ${vx} ${vy}`} fill="none" stroke={GREEN} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

// Full circular progress ring (0..1).
export function Ring({ value, size = 60, color = GREEN }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth="5" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// Horizontal split bar showing win share vs loss share.
export function SplitBar({ winShare }) {
  const w = Math.max(0, Math.min(100, winShare * 100));
  return (
    <div className="splitbar">
      <div className="splitbar-fill" style={{ width: `${w}%` }} />
    </div>
  );
}
