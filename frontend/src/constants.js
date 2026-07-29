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

// Human labels for the objective adherence rule types (see src/adherence.js
// RULE_TYPES). Shared by the trade-preview badge and the trade-log RULES column
// so the two can never drift apart.
export const RULE_LABEL = {
  session: 'session',
  direction: 'direction',
  max_sl: 'max SL',
  min_sl: 'min SL',
  symbols: 'symbol',
  weekdays: 'weekday',
  hours: 'time',
};
