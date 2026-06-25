export const SETUP_OPTIONS = ['Continue', 'Liq-run', 'Fractal', 'SMC'];
export const PROBABILITY_OPTIONS = ['HIGH', 'MED', 'LOW'];
export const MTF_OPTIONS = ['A', 'A2', 'B', 'C', 'D', 'RANGE'];

// kebab-safe class suffixes for color coding
export const slug = (v) => (v ? String(v).toLowerCase().replace(/[^a-z0-9]/g, '') : '');

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function fmtNum(v, dp = 2) {
  if (v == null || v === '') return '';
  return Number(v).toFixed(dp);
}
