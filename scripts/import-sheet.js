// Import historical trades from the Google Sheet "Trades" tab.
//
// Usage:
//   node scripts/import-sheet.js                 # fetch live from the published sheet
//   node scripts/import-sheet.js path/to.csv     # import a downloaded CSV instead
//
// Imported rows: source='import', tagged=true, account_id=0 (sentinel).
// Re-running clears previous imports and reloads — it never touches live EA trades.
import { readFile } from 'node:fs/promises';
import { pool } from '../src/platform/db.js';
import { normalizeSymbol } from '../src/domain/trades/derive.js';
import { parseCsv } from '../src/domain/trades/csv.js';

const SHEET_ID = '1N_hUdF8LtcEEQoa4qsDCurOEa_6SXWk2MO8MPGBgBPU';
const TRADES_GID = '26444216';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${TRADES_GID}`;
const IMPORT_ACCOUNT_ID = 0;

function parseDate(ddmmyy) {
  const m = ddmmyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const dd = +m[1], mm = +m[2];
  let yy = +m[3];
  if (yy < 100) yy += 2000;
  // store at midday UTC so the date is unambiguous across timezones
  return new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0)).toISOString();
}

const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v) => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

async function load() {
  const arg = process.argv[2];
  if (arg) {
    console.log(`reading ${arg}`);
    return readFile(arg, 'utf8');
  }
  console.log(`fetching ${SHEET_URL}`);
  const res = await fetch(SHEET_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`sheet fetch failed: ${res.status}`);
  return res.text();
}

async function main() {
  const csv = await load();
  const rows = parseCsv(csv);

  // find the header row, then read trades until a row without a valid date
  const headerIdx = rows.findIndex((r) => (r[0] || '').startsWith('DATE'));
  if (headerIdx < 0) throw new Error('could not find header row (DATE ...)');

  const trades = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const closeTime = parseDate(r[0] || '');
    if (!closeTime) continue; // skip blank / non-trade rows
    const symbol = str(r[2]);
    if (!symbol) continue;
    trades.push({
      account_id: IMPORT_ACCOUNT_ID,
      source: 'import',
      symbol,
      symbol_base: normalizeSymbol(symbol),
      direction: null,
      open_time: closeTime,
      close_time: closeTime,
      session: str(r[1]),
      setup: str(r[3]),
      probability: str(r[4]),
      mtf_phase: str(r[5]),
      sl_size_pips: num(r[6]),
      mfe_pips: num(r[7]),
      max_r: num(r[8]),
      fixed_r: num(r[9]),
      comments: str(r[13]),
      tagged: true,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(
      'DELETE FROM trades WHERE source = $1 AND account_id = $2',
      ['import', IMPORT_ACCOUNT_ID]
    );
    const cols = Object.keys(trades[0]);
    for (const t of trades) {
      const vals = cols.map((c) => t[c]);
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO trades (${cols.join(', ')}) VALUES (${ph})`,
        vals
      );
    }
    await client.query('COMMIT');
    console.log(`cleared ${del.rowCount} prior import(s); inserted ${trades.length} trade(s).`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
