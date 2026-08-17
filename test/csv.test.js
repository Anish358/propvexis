import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, detectColumns, parseWhen, buildImportTrades } from '../src/domain/trades/csv.js';

test('parseCsv handles quotes, commas, and embedded newlines', () => {
  const rows = parseCsv('a,b,c\n1,"x,y","line1\nline2"\n');
  assert.deepEqual(rows[0], ['a', 'b', 'c']);
  assert.deepEqual(rows[1], ['1', 'x,y', 'line1\nline2']);
});

test('detectColumns maps aliases case/space/punctuation-insensitively', () => {
  const cols = detectColumns(['Close Time', 'Pair', 'Side', 'Entry Price', 'S/L', 'Exit', 'R']);
  assert.equal(cols.close_time, 0);
  assert.equal(cols.symbol, 1);
  assert.equal(cols.direction, 2);
  assert.equal(cols.entry_price, 3);
  assert.equal(cols.sl_price, 4);
  assert.equal(cols.exit_price, 5);
  assert.equal(cols.fixed_r, 6);
});

test('parseWhen accepts dd/mm/yyyy and ISO, rejects junk', () => {
  assert.equal(parseWhen('01/07/2026').slice(0, 10), '2026-07-01');
  assert.equal(parseWhen('2026-07-01T10:00:00Z').slice(0, 10), '2026-07-01');
  assert.equal(parseWhen('not a date'), null);
});

test('buildImportTrades derives fixed_r from prices when R column absent', () => {
  const csv = 'Date,Symbol,Direction,Entry,SL,Exit\n01/07/2026,EURUSD,buy,1.1000,1.0980,1.1050';
  const { trades, fatal, warnings } = buildImportTrades(parseCsv(csv));
  assert.equal(fatal, null);
  assert.equal(trades.length, 1);
  // reward 50 / risk 20 = 2.5 R
  assert.equal(trades[0].fixed_r, 2.5);
  assert.equal(trades[0].direction, 'buy');
  assert.equal(trades[0].source, 'import');
  assert.equal(trades[0].symbol_base, 'EURUSD');
  // has prices + direction, so no "can't compute R" warning
  assert.equal(warnings.some((w) => w.message.includes('R-based analytics')), false);
});

test('buildImportTrades uses an explicit R column verbatim', () => {
  const csv = 'Date,Symbol,R\n2026-07-01,XAUUSD,1.8';
  const { trades } = buildImportTrades(parseCsv(csv));
  assert.equal(trades[0].fixed_r, 1.8);
});

test('buildImportTrades warns when R cannot be determined', () => {
  const csv = 'Date,Symbol\n2026-07-01,EURUSD';
  const { warnings } = buildImportTrades(parseCsv(csv));
  assert.equal(warnings.some((w) => w.level === 'warn' && w.message.includes('R-based analytics')), true);
});

test('buildImportTrades is fatal without a date or symbol column', () => {
  assert.match(buildImportTrades(parseCsv('Symbol,R\nEURUSD,1')).fatal, /date/);
  assert.match(buildImportTrades(parseCsv('Date,R\n2026-07-01,1')).fatal, /symbol/);
});

test('buildImportTrades skips unusable rows but keeps good ones', () => {
  const csv = 'Date,Symbol,R\n2026-07-01,EURUSD,1\n,EURUSD,2\nbadDate,GBPUSD,3\n2026-07-02,XAUUSD,1.5';
  const { trades, skipped } = buildImportTrades(parseCsv(csv));
  assert.equal(trades.length, 2);
  assert.equal(skipped.length, 2);
});
