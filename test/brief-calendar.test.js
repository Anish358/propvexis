import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import {
  filterBriefEvents, briefWindowRange, defaultBriefPrefs, BRIEF_CURRENCIES,
} from '../frontend/src/features/dashboard/briefPrefs.js';

/* THE EVENTS COLUMN SHOWS WHAT ITS FILTERS SAY, AND NOTHING ELSE.
 *
 * Three things used to sit between the filters and the rows: a cap, a fallback and a set
 * of invented sample events. The fallback was the damaging one — when the window was
 * empty it substituted the next high-impact events from the WHOLE feed, ignoring the
 * window. On a Sunday with "Today" selected that put Tuesday and Wednesday releases
 * under a heading that said Today, so the range switcher appeared not to work.
 */

const dash = stripComments(readSrc('features/dashboard/Dashboard.jsx'));
const brief = readSrc('components/primitives/brief.jsx');

const NOW = new Date('2026-08-30T12:00:00Z');     // a Sunday
const at = (h) => new Date(NOW.getTime() + h * 3600_000).toISOString();
const FEED = [
  { date: at(3), title: 'Today late', country: 'USD', impact: 'high' },
  { date: at(30), title: 'Tuesday', country: 'USD', impact: 'high' },
  { date: at(54), title: 'Wednesday', country: 'USD', impact: 'high' },
  { date: at(200), title: 'Next week', country: 'USD', impact: 'high' },
];
const prefs = { ...defaultBriefPrefs(), timezone: 'utc', currencies: ['USD'] };

test('Today means today — not "the next few, whenever they are"', () => {
  const out = filterBriefEvents(FEED, { ...prefs, window: 'today' }, NOW);
  assert.deepEqual(out.map((e) => e.title), ['Today late']);
  const { to } = briefWindowRange({ ...prefs, window: 'today' }, NOW);
  assert.equal(new Date(to).toISOString(), '2026-08-31T00:00:00.000Z', 'Today ends at midnight');
});

test('Week means the week, and the two are genuinely different', () => {
  const today = filterBriefEvents(FEED, { ...prefs, window: 'today' }, NOW);
  const week = filterBriefEvents(FEED, { ...prefs, window: 'week' }, NOW);
  assert.deepEqual(week.map((e) => e.title), ['Today late', 'Tuesday', 'Wednesday']);
  assert.ok(week.length > today.length, 'the switcher must actually change the list');
  // And neither reaches past its own end.
  assert.ok(!week.some((e) => e.title === 'Next week'));
});

test('an empty window stays empty — no substitute list', () => {
  // The Sunday case: nothing left today. The honest answer is an empty column with a
  // reason, not Tuesday's releases relabelled.
  const quiet = filterBriefEvents(FEED, { ...prefs, window: 'today' }, new Date('2026-08-30T23:30:00Z'));
  assert.deepEqual(quiet, []);
  assert.ok(!/fallbackBriefEvents|sampleBriefEvents/.test(dash),
    'the fallback or the samples are back — the window control lies again if so');
  assert.ok(!dash.includes('Nothing inside your Brief window'),
    "the fallback's note is back");
});

test('nothing caps the list, because the column scrolls', () => {
  // A cap on a scrolling list hides rows with no affordance at all.
  assert.match(dash, /filterBriefEvents\(events \|\| \[\], prefs, now\),/);
  assert.ok(!/filterBriefEvents\([^)]*\)\.slice\(/.test(dash), 'the events list is capped again');
  assert.ok(!/notifications\.filter\(\(n\) => !n\.read_at\)\.slice\(/.test(dash), 'the alerts list is capped again');
  assert.match(brief, /max-h-\[153px\] overflow-x-hidden overflow-y-auto/, 'the section must scroll');
});

test('every currency Brief settings offers has a flag drawn for it', () => {
  /* It drew three and gave the other six an identical grey disc, which makes the flag
   * column worthless for exactly the traders who selected those currencies — an AUD row
   * and an NZD row were the same blank circle. Each is now drawn from its own official
   * geometry; the currency CODE still renders beside it, so the flag stays a scanning
   * aid rather than the only thing carrying which market a row is about. */
  const flag = brief.slice(brief.indexOf('function Flag({ code })'));
  for (const code of BRIEF_CURRENCIES) {
    assert.ok(flag.includes(`'${code}'`), `${code} has no flag — it would render a blank disc`);
  }
  // The neutral disc survives for anything the feed sends that settings does not list.
  assert.match(flag, /rounded-full border border-\[var\(--line-chip\)\]/);
});
