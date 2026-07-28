// JS-side access to the design tokens declared in styles.css :root — the single
// rebrand surface. Canvas/chart code (lightweight-charts, Recharts, Razorpay
// theme) can't always consume CSS var() strings, so read the computed value at
// runtime with a fallback for non-DOM contexts (tests).
export const BRAND = 'PropVexis';

const FALLBACKS = {
  '--accent': '#3b82f6',   // brand blue
  '--accent-bg': 'rgba(59,130,246,0.14)',
  '--profit': '#22c55e',   // trade profit (green)
  '--loss': '#ef4444',     // trade loss (red)
  '--ai': '#8b5cf6',       // AI / insight accent (purple)
  '--payout': '#38bdf8',   // funded-account payout highlight (cyan)
  '--status-bad': '#ef4444',
  '--red': '#ef4444',
  '--muted': '#94a3b8',
  '--neutral-7': '#23232a',  // gauge/ring track (DashWidgets)
};

export function token(name) {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return FALLBACKS[name] || '';
}

// The chart palette, resolved from the token layer.
//
// Call this DURING RENDER, never into a module-level const. Capturing at import
// pins the palette to whichever theme was active on first load, so switching
// theme would leave every chart on the old colours until a reload — the exact
// bug this replaced.
//
// Cached per theme so the repeat calls are free: getComputedStyle is not, and a
// gauge would otherwise pay for it on every render. The cache key is the live
// data-theme attribute, so it invalidates itself the moment the theme changes —
// which is why callers need no theme prop, context or memo.
let paletteCache = null;
let paletteKey = null;

export function chartPalette() {
  const key = (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'dark';
  if (paletteCache && paletteKey === key) return paletteCache;
  paletteKey = key;
  paletteCache = {
    profit: token('--profit'),
    loss: token('--loss'),
    accent: token('--accent'),
    grid: token('--line'),
    gridStrong: token('--line-strong'),
    axis: token('--text-3'),
    label: token('--text-2'),
    track: token('--neutral-7'),
    tip: {
      background: token('--surface-2'),
      border: `1px solid ${token('--line')}`,
      borderRadius: 8,
      color: token('--text'),
    },
  };
  return paletteCache;
}
