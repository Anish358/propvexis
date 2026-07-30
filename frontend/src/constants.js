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

// "22 Jul 26" — the trade log's date, where a month NAME reads faster down a
// column than 22/07/26 (which is also ambiguous to a US reader). Separate from
// fmtDate rather than replacing it: fmtDate feeds fmtDateTime, which the tag modal
// and the preview panel render inline, and those aren't part of this change.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDayShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
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

// Compact trade duration (open -> close), e.g. "12m", "3h 5m", "2d 4h".
export function fmtDuration(openIso, closeIso) {
  if (!openIso || !closeIso) return '';
  const ms = new Date(closeIso) - new Date(openIso);
  if (!(ms >= 0)) return '';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}
