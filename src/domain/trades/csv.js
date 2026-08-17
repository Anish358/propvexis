// CSV import: parsing + header mapping + row→trade transform. Pure (no DB), so
// it's unit-testable like derive.js. The HTTP endpoint composes this with the
// DB insert; scripts/import-sheet.js reuses parseCsv.
//
// Users upload a CSV with a HEADER row; we map recognized column names (via
// aliases, case/space/punctuation-insensitive) to trade fields, compute the
// derived analytics fields, and report which analytics won't work because a
// source column is missing (the "tell me what's missing" requirement).
import { normalizeSymbol, priceToPips, deriveFixedR, deriveMaxR, deriveSession, round2 } from './derive.js';

// --- minimal RFC-4180 CSV parser (handles quotes + embedded newlines) ---
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Canonical trade field -> accepted header aliases (normalized: lowercased,
// non-alphanumerics stripped). First match wins.
const ALIASES = {
  close_time:   ['closetime', 'closedate', 'date', 'exittime', 'exitdate', 'time'],
  open_time:    ['opentime', 'opendate', 'entrytime', 'entrydate'],
  symbol:       ['symbol', 'pair', 'instrument', 'ticker', 'market'],
  direction:    ['direction', 'side', 'type', 'position', 'buysell'],
  entry_price:  ['entryprice', 'entry', 'openprice', 'priceopen'],
  exit_price:   ['exitprice', 'exit', 'closeprice', 'priceclose'],
  sl_price:     ['slprice', 'sl', 'stop', 'stoploss', 'stopprice'],
  tp_price:     ['tpprice', 'tp', 'takeprofit', 'target'],
  fixed_r:      ['fixedr', 'r', 'rmultiple', 'rr', 'result', 'resultr', 'rresult'],
  sl_size_pips: ['slsizepips', 'slpips', 'stoppips', 'slsize', 'riskpips'],
  mfe_pips:     ['mfepips', 'mfe', 'maxfavorableexcursion'],
  pnl_money:    ['pnlmoney', 'pnl', 'profit', 'pl', 'netpl', 'netprofit', 'profitloss', 'pandl'],
  volume:       ['volume', 'lots', 'size', 'lotsize', 'quantity', 'qty'],
  session:      ['session'],
  setup:        ['setup', 'strategy', 'playbook'],
  comments:     ['comments', 'comment', 'notes', 'note'],
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Map a header row to { field: columnIndex } for every recognized column.
export function detectColumns(header) {
  const normalized = header.map(norm);
  const fieldToIndex = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) fieldToIndex[field] = idx;
  }
  return fieldToIndex;
}

const numOf = (v) => {
  const s = String(v ?? '').trim().replace(/[, ]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const strOf = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };

// Flexible date: dd/mm/yyyy (or dd/mm/yy) first, else anything Date can parse
// (ISO, etc). Returns an ISO string or null.
export function parseWhen(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let yy = +m[3]; if (yy < 100) yy += 2000;
    return new Date(Date.UTC(yy, +m[2] - 1, +m[1], 12, 0, 0)).toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseDirection(v) {
  const s = norm(v);
  if (['buy', 'long', 'b', 'bull'].includes(s)) return 'buy';
  if (['sell', 'short', 's', 'bear'].includes(s)) return 'sell';
  return null;
}

// Analytics-impact warnings from which columns are present. `has(field)` = that
// column was mapped in the header.
function buildWarnings(cols) {
  const has = (f) => f in cols;
  const w = [];
  const canDeriveR = has('entry_price') && has('sl_price') && has('exit_price');
  if (!has('fixed_r') && !canDeriveR) {
    w.push({ level: 'warn', message: 'No R result column and no entry/SL/exit prices to compute one — R-based analytics (expectancy, R totals, win rate) will be blank for these trades.' });
  }
  if (!has('direction')) {
    w.push({ level: 'warn', message: 'No direction (buy/sell) column — long vs short breakdowns will be unavailable.' });
  }
  if (!has('sl_size_pips') && !has('mfe_pips')) {
    w.push({ level: 'info', message: 'No SL-size / MFE columns — Max-R (how far price ran in your favor) will be unavailable.' });
  }
  if (!has('pnl_money')) {
    w.push({ level: 'info', message: 'No P/L ($) column — the per-account dollar view will be blank (R analytics still work).' });
  }
  return w;
}

// Transform parsed CSV rows into insertable import trades.
// Returns { trades, columns, warnings, skipped, fatal }.
//  - fatal: a string when the file can't be imported at all (no symbol/date column)
//  - skipped: [{ line, reason }] for individual unusable rows
export function buildImportTrades(rows) {
  if (!rows.length) return { trades: [], columns: {}, warnings: [], skipped: [], fatal: 'file is empty' };
  const header = rows[0];
  const cols = detectColumns(header);

  if (!('close_time' in cols)) {
    return { trades: [], columns: cols, warnings: [], skipped: [], fatal: 'no date / close-time column found (expected a column like "Date" or "Close Time")' };
  }
  if (!('symbol' in cols)) {
    return { trades: [], columns: cols, warnings: [], skipped: [], fatal: 'no symbol column found (expected a column like "Symbol" or "Pair")' };
  }

  const cell = (row, field) => (field in cols ? row[cols[field]] : undefined);
  const trades = [];
  const skipped = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => String(c ?? '').trim() === '')) continue; // blank line
    const close_time = parseWhen(cell(row, 'close_time'));
    const symbol = strOf(cell(row, 'symbol'));
    if (!close_time) { skipped.push({ line: i + 1, reason: 'unparseable/missing date' }); continue; }
    if (!symbol) { skipped.push({ line: i + 1, reason: 'missing symbol' }); continue; }

    const open_time = parseWhen(cell(row, 'open_time')) || close_time;
    const direction = parseDirection(cell(row, 'direction'));
    const entry_price = numOf(cell(row, 'entry_price'));
    const sl_price = numOf(cell(row, 'sl_price'));
    const exit_price = numOf(cell(row, 'exit_price'));
    const tp_price = numOf(cell(row, 'tp_price'));
    const symbol_base = normalizeSymbol(symbol);

    // fixed_r: use the given value, else derive from prices (direction-aware).
    const givenR = numOf(cell(row, 'fixed_r'));
    const fixed_r = givenR != null
      ? round2(givenR)
      : deriveFixedR({ direction, entry_price, sl_price, exit_price });

    // sl_size_pips: given, else from |entry - sl| in pips.
    const sl_size_pips = numOf(cell(row, 'sl_size_pips'))
      ?? (entry_price != null && sl_price != null ? priceToPips(symbol_base, entry_price - sl_price) : null);
    const mfe_pips = numOf(cell(row, 'mfe_pips'));

    trades.push({
      mt5_ticket: null,
      account_id: null,
      source: 'import',
      symbol,
      symbol_base,
      direction,
      open_time,
      close_time,
      session: strOf(cell(row, 'session')) || deriveSession(open_time),
      entry_price,
      sl_price,
      tp_price,
      exit_price,
      volume: numOf(cell(row, 'volume')),
      pnl_money: numOf(cell(row, 'pnl_money')),
      sl_size_pips: round2(sl_size_pips),
      mfe_pips: round2(mfe_pips),
      max_r: deriveMaxR({ mfe_pips, sl_size_pips }),
      fixed_r,
      setup: strOf(cell(row, 'setup')),
      comments: strOf(cell(row, 'comments')),
      tagged: true,
    });
  }

  return { trades, columns: cols, warnings: buildWarnings(cols), skipped, fatal: null };
}
