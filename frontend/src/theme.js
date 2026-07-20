// JS-side access to the design tokens declared in styles.css :root — the single
// rebrand surface. Canvas/chart code (lightweight-charts, Recharts, Razorpay
// theme) can't always consume CSS var() strings, so read the computed value at
// runtime with a fallback for non-DOM contexts (tests).
export const BRAND = 'PropVexis';

const FALLBACKS = {
  '--accent': '#3b82f6',   // brand blue
  '--accent-bg': '#12233f',
  '--profit': '#22c55e',   // trade profit (green)
  '--loss': '#f87171',     // trade loss (red)
  '--ai': '#8b5cf6',       // AI / insight accent (purple)
  '--payout': '#38bdf8',   // funded-account payout highlight (cyan)
  '--status-bad': '#f87171',
  '--red': '#ef4444',
  '--muted': '#94a3b8',
};

export function token(name) {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return FALLBACKS[name] || '';
}
