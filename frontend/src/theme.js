// JS-side access to the design tokens declared in styles.css :root — the single
// rebrand surface. Canvas/chart code (lightweight-charts, Recharts, Razorpay
// theme) can't always consume CSS var() strings, so read the computed value at
// runtime with a fallback for non-DOM contexts (tests).
export const BRAND = 'PATIL TRADES';

const FALLBACKS = {
  '--accent': '#39d98a',
  '--accent-bg': '#112a1c',
  '--status-bad': '#e0605a',
  '--red': '#b3403a',
  '--muted': '#6f6f78',
};

export function token(name) {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return FALLBACKS[name] || '';
}
