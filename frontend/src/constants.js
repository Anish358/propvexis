export const SETUP_OPTIONS = ['Continue', 'Liq-run', 'Fractal', 'SMC'];
export const PROBABILITY_OPTIONS = ['HIGH', 'MED', 'LOW'];
export const MTF_OPTIONS = ['A', 'A2', 'B', 'C', 'D', 'RANGE'];

// kebab-safe class suffixes for color coding
export const slug = (v) => (v ? String(v).toLowerCase().replace(/[^a-z0-9]/g, '') : '');

// Dates/times are stored UTC (timestamptz) but shown in the USER's local zone —
// `new Date(iso)` + local getters do the conversion. Times are 24-hour HH:MM.
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

export function fmtNum(v, dp = 2) {
  if (v == null || v === '') return '';
  return Number(v).toFixed(dp);
}
