// Helpers to fill in fields the EA may not send. The EA is the authoritative
// source for anything it computes (pip size depends on the symbol's tick size,
// which the terminal knows best). These functions only fill gaps.

// Fallback pip size per symbol family. Used ONLY when the EA does not provide
// sl_size_pips / mfe_pips directly. Override per-symbol as needed.
const PIP_SIZE = {
  XAUUSD: 0.1,
  XAGUSD: 0.01,
};
const DEFAULT_PIP = 0.0001;
const JPY_PIP = 0.01;

// Known instrument bases, used to strip broker suffixes like EURUSD.r / XAUUSDm.
// Add any symbols your broker offers that aren't covered by the generic rules.
const KNOWN_BASES = [
  'XAUUSD', 'XAGUSD',
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY',
  'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURAUD', 'GBPAUD', 'EURCAD',
  'BTCUSD', 'ETHUSD',
];

// Reduce a broker symbol to its base, e.g. "EURUSD.r" -> "EURUSD",
// "XAUUSDm" -> "XAUUSD", "GBPUSD.pro" -> "GBPUSD".
export function normalizeSymbol(symbol) {
  if (!symbol) return symbol;
  let s = symbol.toUpperCase().split(/[._\-#/ ]/)[0]; // drop separator suffixes
  for (const base of KNOWN_BASES) {
    if (s.startsWith(base)) return base; // handles glued suffixes like XAUUSDM
  }
  return s;
}

export function pipSize(symbol) {
  if (!symbol) return DEFAULT_PIP;
  const base = normalizeSymbol(symbol);
  if (PIP_SIZE[base] != null) return PIP_SIZE[base];
  if (base.includes('JPY')) return JPY_PIP;
  return DEFAULT_PIP;
}

// Convert an absolute price distance to pips for a symbol.
export function priceToPips(symbol, priceDistance) {
  if (priceDistance == null) return null;
  return Math.abs(priceDistance) / pipSize(symbol);
}

// Map a trade's open time to a session bucket (UTC-hour heuristic).
// The user can always override this when tagging the trade.
export function deriveSession(openTime) {
  const d = openTime instanceof Date ? openTime : new Date(openTime);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getUTCHours();
  if (h >= 7 && h < 12) return 'LDN';
  if (h >= 12 && h < 21) return 'NY';
  return 'ASIA'; // 21:00–06:59 UTC
}

// Realized R multiple from prices: reward distance / risk distance.
// Positive = win in R, negative = loss in R, ~0 = breakeven.
export function deriveFixedR({ direction, entry_price, sl_price, exit_price }) {
  if (entry_price == null || sl_price == null || exit_price == null) return null;
  const risk = Math.abs(entry_price - sl_price);
  if (risk === 0) return null;
  const reward =
    direction === 'buy' ? exit_price - entry_price : entry_price - exit_price;
  return round2(reward / risk);
}

// Max R = how far price ran in our favor, in units of risk.
export function deriveMaxR({ mfe_pips, sl_size_pips }) {
  if (mfe_pips == null || !sl_size_pips) return null;
  return round2(mfe_pips / sl_size_pips);
}

export function round2(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}
