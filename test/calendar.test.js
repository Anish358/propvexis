import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingHighImpact } from '../src/calendar.js';

// Pure feed-normalization core: keep only High-impact, upcoming (within a 1h
// grace) events, soonest first, capped, in the client-facing shape.

const NOW = new Date('2026-07-24T12:00:00Z');

const feed = [
  { title: 'CPI y/y', country: 'USD', impact: 'High', date: '2026-07-24T12:30:00Z', forecast: '3.1%', previous: '3.0%' },
  { title: 'Retail Sales', country: 'GBP', impact: 'Medium', date: '2026-07-24T13:00:00Z' },
  { title: 'Rate Decision', country: 'EUR', impact: 'High', date: '2026-07-25T11:00:00Z' },
  { title: 'Old NFP', country: 'USD', impact: 'High', date: '2026-07-23T12:00:00Z' }, // >1h in the past
  { title: 'Just started', country: 'JPY', impact: 'High', date: '2026-07-24T11:30:00Z' }, // 30m ago — kept
];

test('keeps only high-impact events', () => {
  const out = upcomingHighImpact(feed, NOW);
  assert.ok(out.every((e) => e.title !== 'Retail Sales'));
});

test('drops events older than the 1h grace, keeps in-play ones', () => {
  const titles = upcomingHighImpact(feed, NOW).map((e) => e.title);
  assert.ok(!titles.includes('Old NFP'));      // 24h ago → dropped
  assert.ok(titles.includes('Just started'));  // 30m ago → kept
});

test('sorted soonest-first', () => {
  const out = upcomingHighImpact(feed, NOW);
  const ts = out.map((e) => Date.parse(e.date));
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.equal(out[0].title, 'Just started');
});

test('client shape carries no internal ts field', () => {
  const [e] = upcomingHighImpact(feed, NOW);
  assert.deepEqual(Object.keys(e).sort(), ['country', 'date', 'forecast', 'previous', 'title']);
});

test('respects the limit', () => {
  const big = Array.from({ length: 20 }, (_, i) => ({
    title: `E${i}`, country: 'USD', impact: 'High', date: `2026-07-24T${String(13 + (i % 10)).padStart(2, '0')}:00:00Z`,
  }));
  assert.equal(upcomingHighImpact(big, NOW, 6).length, 6);
});

test('tolerates junk input', () => {
  assert.deepEqual(upcomingHighImpact(null, NOW), []);
  assert.deepEqual(upcomingHighImpact([null, {}, { impact: 'High', date: 'nonsense' }], NOW), []);
});
