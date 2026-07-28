import React from 'react';

// Artwork for the auth split screen. Deliberately abstract and geometric
// (MASTER.md: "simple, abstract, dark, geometric — no cartoon traders"): an
// equity curve over a candle series, drawn in the token palette so it follows a
// theme switch. Every number here is decoration — the parent marks the whole
// panel aria-hidden so assistive tech never reads it as account data.

// [x, open, close, high, low] in SVG user units (y grows down, so a lower y is
// a higher price). Trends up across the series to pair with the equity curve.
const CANDLES = [
  [150, 786, 770, 762, 792], [178, 770, 778, 764, 786], [206, 778, 756, 748, 782],
  [234, 756, 760, 750, 770], [262, 760, 740, 730, 764], [290, 740, 724, 716, 744],
  [318, 724, 734, 718, 742], [346, 734, 710, 700, 738], [374, 710, 716, 704, 726],
  [402, 716, 690, 680, 720], [430, 690, 672, 664, 696], [458, 672, 680, 666, 690],
  [486, 680, 654, 644, 684], [514, 654, 636, 628, 660], [542, 636, 644, 630, 652],
  [570, 644, 614, 604, 648],
];

const CURVE = 'M -20 512 C 54 500 108 470 158 468 S 228 420 268 390 S 330 378 366 346'
  + ' S 430 330 470 290 S 548 258 596 208';

const BODY_W = 15;

// The candle series is authored in a compact band, then stretched to fill the
// lower half of the panel — keeps the numbers above readable while the artwork
// scales with the viewport.
const sx = (x) => (x - 150) * 1.28 + 60;
const sy = (y) => 800 - (800 - y) * 1.42;

export default function AuthArt() {
  return (
    <svg className="auth-art-svg" viewBox="0 0 640 900" preserveAspectRatio="xMidYMid slice" role="presentation">
      <defs>
        <linearGradient id="pvAuthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <filter id="pvAuthGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>

      {/* grid — the faintest possible structure, so the panel reads as a chart */}
      <g stroke="var(--line)" strokeWidth="1">
        {[140, 240, 340, 440, 540, 640, 740, 840].map((y) => (
          <line key={y} x1="0" y1={y} x2="640" y2={y} />
        ))}
        {[80, 220, 360, 500, 620].map((x) => (
          <line key={x} x1={x} y1="90" x2={x} y2="860" opacity="0.5" />
        ))}
      </g>

      {/* equity curve: brand blue (product), never an outcome colour */}
      <path d={`${CURVE} L 596 500 L -20 500 Z`} fill="url(#pvAuthFill)" />
      <path d={CURVE} fill="none" stroke="var(--accent)" strokeWidth="10" opacity="0.35" filter="url(#pvAuthGlow)" />
      <path d={CURVE} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      {/* "now" cursor — anchors the curve's end instead of letting the fill taper
          off into a stray diagonal at the panel edge */}
      <line x1="596" y1="208" x2="596" y2="812" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 6" />
      <circle cx="596" cy="208" r="4.5" fill="var(--accent)" />
      <circle cx="596" cy="208" r="11" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />

      {/* candles: green/red are trade outcomes, the one place they belong */}
      <g strokeWidth="1.5">
        {CANDLES.map(([x, open, close, high, low]) => {
          const up = close < open;                        // lower y = higher price
          const colour = up ? 'var(--profit)' : 'var(--loss)';
          return (
            <g key={x} stroke={colour} fill={colour} opacity="0.85">
              <line x1={sx(x)} y1={sy(high)} x2={sx(x)} y2={sy(low)} />
              <rect
                x={sx(x) - BODY_W / 2}
                y={sy(Math.min(open, close))}
                width={BODY_W}
                height={Math.max(Math.abs(sy(close) - sy(open)), 2)}
                rx="1.5"
                fillOpacity={up ? 1 : 0.28}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
