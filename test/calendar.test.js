import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingEvents, normalizeImpact } from '../src/platform/calendar.js';

// Pure feed-normalization core: keep the upcoming events (within a 1h grace),
// soonest first, capped, in the client-facing shape. Impact is NOT filtered here
// any more — Today's Brief lets the user widen to medium/all, so the route has to
// serve the full window and let the client narrow it.

const NOW = new Date('2026-07-24T12:00:00Z');

const feed = [
  { title: 'CPI y/y', country: 'USD', impact: 'High', date: '2026-07-24T12:30:00Z', forecast: '3.1%', previous: '3.0%' },
  { title: 'Retail Sales', country: 'GBP', impact: 'Medium', date: '2026-07-24T13:00:00Z' },
  { title: 'Rate Decision', country: 'EUR', impact: 'High', date: '2026-07-25T11:00:00Z' },
  { title: 'Old NFP', country: 'USD', impact: 'High', date: '2026-07-23T12:00:00Z' }, // >1h in the past
  { title: 'Just started', country: 'JPY', impact: 'High', date: '2026-07-24T11:30:00Z' }, // 30m ago — kept
  { title: 'Bank Holiday', country: 'CHF', impact: 'Holiday', date: '2026-07-24T14:00:00Z' },
  { title: 'Speech', country: 'CAD', impact: 'Low', date: '2026-07-24T15:00:00Z' },
];

test('keeps every impact level, labelled', () => {
  const out = upcomingEvents(feed, NOW);
  const byTitle = Object.fromEntries(out.map((e) => [e.title, e.impact]));
  assert.equal(byTitle['CPI y/y'], 'high');
  assert.equal(byTitle['Retail Sales'], 'medium', 'medium events must survive for the High+Medium setting');
  assert.equal(byTitle['Speech'], 'low', 'low events must survive for the All Events setting');
  assert.equal(byTitle['Bank Holiday'], 'holiday');
});

test('normalizeImpact closes the set, defaulting unknowns to low', () => {
  assert.equal(normalizeImpact('High'), 'high');
  assert.equal(normalizeImpact('MEDIUM'), 'medium');
  assert.equal(normalizeImpact('low'), 'low');
  assert.equal(normalizeImpact('Holiday'), 'holiday');
  // An unrecognized label must not drop the event — label it conservatively.
  for (const junk of ['', null, undefined, 'wat', 42]) assert.equal(normalizeImpact(junk), 'low');
});

test('drops events older than the 1h grace, keeps in-play ones', () => {
  const titles = upcomingEvents(feed, NOW).map((e) => e.title);
  assert.ok(!titles.includes('Old NFP'));      // 24h ago → dropped
  assert.ok(titles.includes('Just started'));  // 30m ago → kept
});

test('sorted soonest-first', () => {
  const out = upcomingEvents(feed, NOW);
  const ts = out.map((e) => Date.parse(e.date));
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.equal(out[0].title, 'Just started');
});

test('client shape carries impact and no internal ts field', () => {
  const [e] = upcomingEvents(feed, NOW);
  assert.deepEqual(Object.keys(e).sort(), ['country', 'date', 'forecast', 'impact', 'previous', 'title']);
});

test('respects the limit', () => {
  const big = Array.from({ length: 20 }, (_, i) => ({
    title: `E${i}`, country: 'USD', impact: 'High', date: `2026-07-24T${String(13 + (i % 10)).padStart(2, '0')}:00:00Z`,
  }));
  assert.equal(upcomingEvents(big, NOW, 6).length, 6);
  // The default cap has to be roomy enough for "All events / This week".
  assert.ok(upcomingEvents(big, NOW).length === 20, 'default limit should not truncate a normal week');
});

test('tolerates junk input', () => {
  assert.deepEqual(upcomingEvents(null, NOW), []);
  assert.deepEqual(upcomingEvents([null, {}, { impact: 'High', date: 'nonsense' }], NOW), []);
});
