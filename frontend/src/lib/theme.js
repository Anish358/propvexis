// JS-side access to the design tokens declared in styles.css :root — the single
// rebrand surface. Canvas/chart code (lightweight-charts, Recharts, Razorpay
// theme) can't always consume CSS var() strings, so read the computed value at
// runtime with a fallback for non-DOM contexts (tests).
export const BRAND = 'PropVexis';

const FALLBACKS = {
  // Last resort for non-DOM contexts (tests) only -- live values always come from
  // tokens.css, and design-tokens.test.js resolves both sides and compares them.
  // Outcome hues are the 2026-08-28 Figma values; the blues predate it and are unchanged.
  '--accent': '#193cb8',              // brand FILL
  '--accent-on-surface': '#2b7fff',   // brand as a stroke/link (5.26:1 on --bg)
  '--chart-line': '#e5e5e5',          // a neutral single-series line — see chartPalette
  '--accent-bg': 'rgba(43,127,255,0.14)',
  '--profit': '#00d492',   // trade profit (green) — figma
  '--loss': '#ff6467',     // trade loss (red) — figma
  '--ai': '#8b5cf6',       // AI / insight accent (purple)
  '--payout': '#38bdf8',   // funded-account payout highlight (cyan)
  '--status-bad': '#ff6467',
  '--red': '#ff6467',
  '--muted': '#a1a1a1',
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
    /* THE SERIES LINE, AND IT IS NO LONGER THE BRAND. This read --accent-on-surface
     * (blue) on the reasoning that --accent itself measures 2.24:1 on --bg and vanishes
     * as a 2px stroke. Both are true and both are beside the point after the
     * 2026-08-28 redesign, which has no blue on the dashboard: a single-series line is
     * the figures drawn as a shape, so it takes the neutral --chart-line. Colour on a
     * chart is for series that mean something — profit, loss, payout — and those keys
     * are below, untouched.
     *
     * The KEY is still `accent` because three charts read it by that name; what it
     * points at is the change. */
    accent: token('--chart-line'),
    // Two more domain hues, for the places one series is not enough: a categorical
    // breakdown (Finance's spend ring) needs more than profit/loss/brand before it
    // starts repeating, and both of these already exist as tokens with a settled
    // meaning — payout money and AI/insight — so the palette exposes them rather
    // than each chart inventing a fourth and fifth colour of its own.
    payout: token('--payout'),
    ai: token('--ai'),
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
