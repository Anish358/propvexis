// Simulates the exact JSON the MQL5 EA sends (raw prices + mfe_price, no pips).
// Verifies the backend converts to pips / R correctly and matches the sheet.
import { config } from '../src/config.js';

const base = `http://127.0.0.1:${config.port}`;
const headers = {
  'content-type': 'application/json',
  'x-ingest-token': config.ingestToken,
};

// Two cases lifted from the real sheet:
//  1) EURUSD buy, SL 11.1 pips, ran +4.4 pips, closed at +2R  -> MaxR 0.40, FixedR 2.00
//  2) XAUUSD sell, SL 15.7 pips, ran 80 pips, closed at +2R   -> MaxR 5.10, FixedR 2.00
const cases = [
  {
    mt5_ticket: 900001, account_id: 5000, symbol: 'EURUSD', direction: 'buy',
    open_time: '2026-06-24T13:15:00Z', close_time: '2026-06-24T14:02:00Z',
    entry_price: 1.0812, sl_price: 1.08009, tp_price: 1.08342, exit_price: 1.08342,
    volume: 0.5, commission: -1.4, pnl_money: 111.0,
    mfe_price: 0.00044, // 4.4 pips
  },
  {
    mt5_ticket: 900002, account_id: 5000, symbol: 'XAUUSD', direction: 'sell',
    open_time: '2026-06-22T15:00:00Z', close_time: '2026-06-22T16:30:00Z',
    entry_price: 2330.0, sl_price: 2331.57, tp_price: 2326.86, exit_price: 2326.86,
    volume: 0.1, commission: -0.7, pnl_money: 31.4,
    mfe_price: 8.0, // 80 pips at 0.1 pip size
  },
];

const expect = {
  900001: { sl_size_pips: 11.1, max_r: 0.4, fixed_r: 2, session: 'NY' },
  900002: { sl_size_pips: 15.7, max_r: 5.1, fixed_r: 2, session: 'NY' },
};

let ok = true;
for (const c of cases) {
  const res = await fetch(`${base}/api/trades/ingest`, {
    method: 'POST', headers, body: JSON.stringify(c),
  });
  const t = await res.json();
  const e = expect[c.mt5_ticket];
  const pass =
    t.sl_size_pips === e.sl_size_pips &&
    t.max_r === e.max_r &&
    t.fixed_r === e.fixed_r &&
    t.session === e.session;
  ok = ok && pass;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${t.symbol} ${t.direction}: ` +
    `sl=${t.sl_size_pips}p mfe=${t.mfe_pips}p maxR=${t.max_r} fixedR=${t.fixed_r} session=${t.session}` +
    (pass ? '' : `  EXPECTED ${JSON.stringify(e)}`)
  );
}
console.log(ok ? 'EA CONTRACT OK' : 'EA CONTRACT MISMATCH');
process.exit(ok ? 0 : 1);
