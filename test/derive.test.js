import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSymbol,
  pipSize,
  priceToPips,
  deriveFixedR,
  deriveMaxR,
  round2,
} from '../src/domain/trades/derive.js';

test('normalizeSymbol strips broker suffixes to the known base', () => {
  assert.equal(normalizeSymbol('EURUSD.r'), 'EURUSD');
  assert.equal(normalizeSymbol('XAUUSDm'), 'XAUUSD');   // glued suffix
  assert.equal(normalizeSymbol('GBPUSD.pro'), 'GBPUSD');
  assert.equal(normalizeSymbol('usdjpy'), 'USDJPY');    // case-insensitive
});

test('pipSize is symbol-aware', () => {
  assert.equal(pipSize('EURUSD'), 0.0001);
  assert.equal(pipSize('USDJPY'), 0.01);   // JPY pairs
  assert.equal(pipSize('XAUUSD'), 0.1);    // gold override
  assert.equal(pipSize('XAUUSDm'), 0.1);   // normalized first
});

test('priceToPips converts a price distance using pip size', () => {
  assert.equal(priceToPips('EURUSD', 0.0010), 10);
  assert.equal(priceToPips('USDJPY', 0.50), 50);
  assert.equal(priceToPips('EURUSD', -0.0010), 10); // absolute
  assert.equal(priceToPips('EURUSD', null), null);
});

test('deriveFixedR = reward/risk, signed by direction', () => {
  // buy: 20 pip risk, 40 pip reward -> +2R
  assert.equal(deriveFixedR({ direction: 'buy', entry_price: 1.1000, sl_price: 1.0980, exit_price: 1.1040 }), 2);
  // sell winner: entry above exit -> positive
  assert.equal(deriveFixedR({ direction: 'sell', entry_price: 1.1000, sl_price: 1.1020, exit_price: 1.0960 }), 2);
  // buy loser: exit below entry -> negative
  assert.equal(deriveFixedR({ direction: 'buy', entry_price: 1.1000, sl_price: 1.0980, exit_price: 1.0990 }), -0.5);
});

test('deriveFixedR guards null inputs and zero risk', () => {
  assert.equal(deriveFixedR({ direction: 'buy', entry_price: 1.1, sl_price: null, exit_price: 1.2 }), null);
  assert.equal(deriveFixedR({ direction: 'buy', entry_price: 1.1, sl_price: 1.1, exit_price: 1.2 }), null); // risk 0
});

test('deriveMaxR = mfe/sl, guarding missing/zero', () => {
  assert.equal(deriveMaxR({ mfe_pips: 30, sl_size_pips: 10 }), 3);
  assert.equal(deriveMaxR({ mfe_pips: null, sl_size_pips: 10 }), null);
  assert.equal(deriveMaxR({ mfe_pips: 30, sl_size_pips: 0 }), null);
});

test('round2 rounds to 2dp and passes through null/NaN', () => {
  assert.equal(round2(1.239), 1.24);
  assert.equal(round2(null), null);
  assert.equal(round2(Number.NaN), null);
});
