// JS-side access to the design tokens declared in styles.css :root — the single
// rebrand surface. Canvas/chart code (lightweight-charts, Recharts, Razorpay
// theme) can't always consume CSS var() strings, so read the computed value at
// runtime with a fallback for non-DOM contexts (tests).
export const BRAND = 'PropVexis';

const FALLBACKS = {
  '--accent': '#5e6ad2',   // Linear-exact indigo accent
  '--accent-bg': 'rgba(94,106,210,0.14)',
  '--profit': '#22c55e',   // trade profit (green)
  '--loss': '#f87171',     // trade loss (red)
  '--ai': '#8b5cf6',       // AI / insight accent (purple)
  '--payout': '#38bdf8',   // funded-account payout highlight (cyan)
  '--status-bad': '#f87171',
  '--red': '#ef4444',
  '--muted': '#9a9aa0',
};

export function token(name) {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return FALLBACKS[name] || '';
}
