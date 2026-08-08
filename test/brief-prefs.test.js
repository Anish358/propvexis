import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appCss } from './helpers/app-css.js';
import {
  BRIEF_SECTIONS, BRIEF_IMPORTANCE, BRIEF_CURRENCIES, BRIEF_WINDOWS, BRIEF_TIMEZONES,
  defaultBriefPrefs, sanitizeBriefPrefs, isDefaultBriefPrefs, briefSectionOn,
  impactAllowed, briefWindowRange, filterBriefEvents, briefEmptyReason,
  formatBriefTime, briefEventsLabel, formatBriefDate, formatBriefClock,
} from '../frontend/src/features/dashboard/briefPrefs.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

// Noon UTC on a Friday, so day/week boundary maths is unambiguous.
const NOW = new Date('2026-07-24T12:00:00Z');

const ev = (country, impact, date) => ({ title: `${country} ${impact}`, country, impact, date });
const FEED = [
  ev('USD', 'high', '2026-07-24T13:00:00Z'),    // +1h  today
  ev('USD', 'medium', '2026-07-24T14:00:00Z'),  // +2h  today
  ev('EUR', 'low', '2026-07-24T15:00:00Z'),     // +3h  today
  ev('GBP', 'high', '2026-07-24T20:00:00Z'),    // +8h  today, outside 4h
  ev('JPY', 'high', '2026-07-25T02:00:00Z'),    // tomorrow, inside 24h
  ev('AUD', 'high', '2026-07-28T09:00:00Z'),    // next week-ish, inside 7d
  ev('CHF', 'holiday', '2026-07-24T16:00:00Z'),
];

const titles = (list) => list.map((e) => e.title).sort();

// ---- defaults ---------------------------------------------------------------

test('defaults match the specified panel state', () => {
  const d = defaultBriefPrefs();
  assert.deepEqual(d.sections, { events: true, alerts: true, summary: true, session: true, ai: false });
  assert.equal(d.importance, 'high');
  assert.deepEqual(d.currencies, ['USD', 'EUR', 'GBP']);
  assert.equal(d.window, 'today');
  assert.equal(d.timezone, 'local');
  assert.equal(d.hideEmpty, true);
});

test('catalogues cover the specified options, and Broker Time is absent', () => {
  assert.deepEqual(BRIEF_SECTIONS.map((s) => s.id), ['events', 'alerts', 'summary', 'session', 'ai']);
  assert.deepEqual(BRIEF_IMPORTANCE.map((i) => i.id), ['high', 'highMedium', 'all']);
  assert.deepEqual(BRIEF_CURRENCIES, ['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY', 'CNY']);
  assert.deepEqual(BRIEF_WINDOWS.map((w) => w.id), ['4h', 'today', '24h', 'week']);
  // No broker offset is stored anywhere, so offering Broker Time could only ever
  // print a guessed (wrong) release time.
  assert.deepEqual(BRIEF_TIMEZONES.map((t) => t.id), ['local', 'utc']);
});

test('the three unbuilt sections are flagged, the two live ones are not', () => {
  const soon = BRIEF_SECTIONS.filter((s) => s.soon).map((s) => s.id);
  assert.deepEqual(soon, ['summary', 'session', 'ai']);
});

// ---- persistence ------------------------------------------------------------

test('sanitize keeps valid saved values and rejects invalid enums', () => {
  const p = sanitizeBriefPrefs({
    sections: { events: false, alerts: true, ai: true },
    importance: 'all', currencies: ['JPY', 'USD'], window: 'week', timezone: 'utc', hideEmpty: false,
  });
  assert.equal(p.sections.events, false);
  assert.equal(p.sections.ai, true);
  assert.equal(p.importance, 'all');
  assert.equal(p.window, 'week');
  assert.equal(p.timezone, 'utc');
  assert.equal(p.hideEmpty, false);
  // Stored order is canonicalized to the catalogue order.
  assert.deepEqual(p.currencies, ['USD', 'JPY']);

  const bad = sanitizeBriefPrefs({ importance: 'nope', window: 'fortnight', timezone: 'broker', hideEmpty: 'yes' });
  assert.equal(bad.importance, 'high');
  assert.equal(bad.window, 'today');
  assert.equal(bad.timezone, 'local', 'a saved broker timezone must fall back, not persist');
  assert.equal(bad.hideEmpty, true);
});

test('sanitize preserves an empty currency list but drops unknown codes', () => {
  // An empty list is a MEANINGFUL choice (show nothing), so it must survive.
  assert.deepEqual(sanitizeBriefPrefs({ currencies: [] }).currencies, []);
  assert.deepEqual(sanitizeBriefPrefs({ currencies: ['USD', 'XYZ', 'BTC'] }).currencies, ['USD']);
  // A non-array is corruption, not a choice → defaults.
  assert.deepEqual(sanitizeBriefPrefs({ currencies: 'USD' }).currencies, ['USD', 'EUR', 'GBP']);
});

test('sanitize is fail-safe on junk', () => {
  for (const junk of [null, undefined, 'x', 42, [], true]) {
    assert.deepEqual(sanitizeBriefPrefs(junk), defaultBriefPrefs(), `${JSON.stringify(junk)} should fall back`);
  }
});

test('isDefaultBriefPrefs detects any deviation', () => {
  assert.equal(isDefaultBriefPrefs(defaultBriefPrefs()), true);
  assert.equal(isDefaultBriefPrefs(undefined), true);
  assert.equal(isDefaultBriefPrefs({ ...defaultBriefPrefs(), importance: 'all' }), false);
  assert.equal(isDefaultBriefPrefs({ ...defaultBriefPrefs(), currencies: [] }), false);
  assert.equal(isDefaultBriefPrefs({ ...defaultBriefPrefs(), hideEmpty: false }), false);
  assert.equal(isDefaultBriefPrefs({ ...defaultBriefPrefs(), timezone: 'utc' }), false);
  const d = defaultBriefPrefs();
  assert.equal(isDefaultBriefPrefs({ ...d, sections: { ...d.sections, ai: true } }), false);
  // Same set, different order → still the default (order is canonicalized).
  assert.equal(isDefaultBriefPrefs({ ...d, currencies: ['GBP', 'USD', 'EUR'] }), true);
});

test('briefSectionOn reads the section toggles', () => {
  const p = sanitizeBriefPrefs({ sections: { events: false } });
  assert.equal(briefSectionOn(p, 'events'), false);
  assert.equal(briefSectionOn(p, 'alerts'), true);
  assert.equal(briefSectionOn(undefined, 'events'), false, 'must not throw on missing prefs');
});

// ---- importance -------------------------------------------------------------

test('importance levels admit the right impacts', () => {
  const at = (importance) => sanitizeBriefPrefs({ importance });
  assert.deepEqual(
    ['high', 'medium', 'low', 'holiday'].filter((i) => impactAllowed(at('high'), i)),
    ['high'],
  );
  assert.deepEqual(
    ['high', 'medium', 'low', 'holiday'].filter((i) => impactAllowed(at('highMedium'), i)),
    ['high', 'medium'],
  );
  assert.deepEqual(
    ['high', 'medium', 'low', 'holiday'].filter((i) => impactAllowed(at('all'), i)),
    ['high', 'medium', 'low', 'holiday'],
  );
  // A missing impact is treated as low, so it only shows under "All events".
  assert.equal(impactAllowed(at('high'), undefined), false);
  assert.equal(impactAllowed(at('all'), undefined), true);
});

// ---- time windows -----------------------------------------------------------

test('window ranges are forward-looking from now', () => {
  const at = (window, timezone = 'local') => sanitizeBriefPrefs({ window, timezone });
  const h = 3600e3;
  assert.equal(briefWindowRange(at('4h'), NOW).to - NOW.getTime(), 4 * h);
  assert.equal(briefWindowRange(at('24h'), NOW).to - NOW.getTime(), 24 * h);
  for (const w of ['4h', 'today', '24h', 'week']) {
    assert.equal(briefWindowRange(at(w), NOW).from, NOW.getTime(), `${w} should start at now`);
  }
});

test('day and week boundaries follow the DISPLAY timezone', () => {
  // With UTC selected, "Today" must end at 00:00Z — the same instant the times on
  // screen roll over. Using local midnight while printing UTC would run the
  // "Today" list past the visible date change.
  const utcToday = briefWindowRange(sanitizeBriefPrefs({ window: 'today', timezone: 'utc' }), NOW);
  assert.equal(new Date(utcToday.to).toISOString(), '2026-07-25T00:00:00.000Z');
  const utcWeek = briefWindowRange(sanitizeBriefPrefs({ window: 'week', timezone: 'utc' }), NOW);
  assert.equal(new Date(utcWeek.to).toISOString(), '2026-07-31T00:00:00.000Z');
});

// ---- filtering --------------------------------------------------------------

// Day/week windows are resolved in the DISPLAY timezone, so any test that leans
// on a day boundary must pin it — otherwise the same assertion means different
// things on a UTC+5:30 dev box and in UTC CI. `at()` pins UTC and layers the
// prefs under test on top.
const at = (patch = {}) => sanitizeBriefPrefs({ timezone: 'utc', ...patch });

test('filter narrows by importance, currency and window together', () => {
  // Default: high only, USD/EUR/GBP, today.
  assert.deepEqual(titles(filterBriefEvents(FEED, at(), NOW)), ['GBP high', 'USD high']);

  // Widen importance → the medium USD event joins; EUR low still excluded.
  assert.deepEqual(
    titles(filterBriefEvents(FEED, at({ importance: 'highMedium' }), NOW)),
    ['GBP high', 'USD high', 'USD medium'],
  );

  // Narrow the window to 4h → the 20:00 GBP event drops out.
  assert.deepEqual(
    titles(filterBriefEvents(FEED, at({ window: '4h' }), NOW)),
    ['USD high'],
  );

  // Widen the window to a week + all currencies → the JPY and AUD events appear.
  assert.deepEqual(
    titles(filterBriefEvents(FEED, at({ window: 'week', currencies: BRIEF_CURRENCIES }), NOW)),
    ['AUD high', 'GBP high', 'JPY high', 'USD high'],
  );

  // Currency filter alone.
  assert.deepEqual(
    titles(filterBriefEvents(FEED, at({ currencies: ['GBP'] }), NOW)),
    ['GBP high'],
  );
});

test('a local-timezone day boundary is honoured, not a UTC one', () => {
  // The same 20:00Z event sits inside "Today" in UTC but outside it for a viewer
  // at UTC+5:30 (whose day already ended at 18:30Z). Pinning both directions
  // proves the window follows the display timezone rather than the server's.
  const utcToday = briefWindowRange(at({ window: 'today' }), NOW).to;
  assert.ok(Date.parse('2026-07-24T20:00:00Z') <= utcToday, 'inside UTC today');
  // Reconstruct the local-boundary expectation from the runtime's own offset so
  // this holds wherever the suite runs.
  const localEnd = new Date(NOW); localEnd.setHours(24, 0, 0, 0);
  const localToday = briefWindowRange(sanitizeBriefPrefs({ window: 'today', timezone: 'local' }), NOW).to;
  assert.equal(localToday, localEnd.getTime());
});

test('holiday rows only surface under All Events', () => {
  const all = at({ importance: 'all', currencies: BRIEF_CURRENCIES });
  assert.ok(titles(filterBriefEvents(FEED, all, NOW)).includes('CHF holiday'));
  const hm = at({ importance: 'highMedium', currencies: BRIEF_CURRENCIES });
  assert.ok(!titles(filterBriefEvents(FEED, hm, NOW)).includes('CHF holiday'));
});

test('no currencies selected yields nothing, NOT everything', () => {
  // The inverse of filters.js's convention (empty = unfiltered) — deliberate, so
  // clearing every currency produces an empty state instead of a firehose.
  const none = at({ currencies: [], importance: 'all', window: 'week' });
  assert.deepEqual(filterBriefEvents(FEED, none, NOW), []);
  assert.equal(briefEmptyReason(FEED, none, NOW), 'no-currencies');
});

test('an in-play event that just started is still shown', () => {
  const justStarted = [ev('USD', 'high', '2026-07-24T11:30:00Z')]; // 30m ago
  assert.equal(filterBriefEvents(justStarted, at(), NOW).length, 1);
});

test('empty reasons distinguish filtered-out from an empty feed', () => {
  assert.equal(briefEmptyReason(FEED, at(), NOW), null, 'there are matches');
  // Feed has events, but this combination excludes all of them.
  assert.equal(briefEmptyReason(FEED, at({ currencies: ['NZD'] }), NOW), 'filtered-out');
  assert.equal(briefEmptyReason([], at(), NOW), 'no-events');
});

test('filter tolerates junk events and a junk list', () => {
  assert.deepEqual(filterBriefEvents(null, at(), NOW), []);
  const junk = [null, {}, ev('USD', 'high', 'nonsense'), ...FEED];
  assert.deepEqual(titles(filterBriefEvents(junk, at(), NOW)), ['GBP high', 'USD high']);
});

// ---- formatting -------------------------------------------------------------

test('formatBriefTime honours the timezone and prefixes other days', () => {
  const sameDayUtc = formatBriefTime('2026-07-24T13:00:00Z', 'utc', NOW);
  assert.equal(sameDayUtc, '1:00 PM', 'UTC time, no weekday for today');
  const otherDayUtc = formatBriefTime('2026-07-28T09:00:00Z', 'utc', NOW);
  assert.match(otherDayUtc, /^Tue 9:00 AM$/, 'a later day gets its weekday');
  assert.equal(formatBriefTime('nonsense', 'utc', NOW), '');
  // Local mode must not force a UTC timeZone — the two agree only when the
  // runtime happens to be at UTC+0, so just assert it produces a time.
  assert.match(formatBriefTime('2026-07-24T13:00:00Z', 'local', NOW), /\d{1,2}:\d{2}\s?(AM|PM)/);
});

test('the heading date follows the selected timezone', () => {
  // 2026-07-24T12:00:00Z is a Friday in UTC.
  assert.equal(formatBriefDate(NOW, 'utc'), 'Friday, Jul 24');
  // Local mode must not force UTC — assert the shape, since the runtime's zone
  // decides the value (and can legitimately land on a different day).
  assert.match(formatBriefDate(NOW, 'local'), /^[A-Z][a-z]+day, [A-Z][a-z]{2} \d{1,2}$/);
  // A viewer at UTC-8 is still on Jul 23 at this instant — the heading must agree
  // with the event times under it, not with the server's day.
  const lateUtc = new Date('2026-07-25T02:00:00Z');
  assert.equal(formatBriefDate(lateUtc, 'utc'), 'Saturday, Jul 25');
});

test('the heading clock marks UTC explicitly', () => {
  assert.equal(formatBriefClock(NOW, 'utc'), '12:00 PM UTC');
  // Local needs no suffix — it matches the viewer's own clock. Shape only, since
  // the runtime's zone decides the value.
  const local = formatBriefClock(NOW, 'local');
  assert.match(local, /^\d{1,2}:\d{2}\s?(AM|PM)$/);
  assert.ok(!local.includes('UTC'), 'local time must not be labelled UTC');
});

test('the events label tracks the importance setting', () => {
  assert.equal(briefEventsLabel(sanitizeBriefPrefs({ importance: 'high' })), 'High-impact events');
  assert.equal(briefEventsLabel(sanitizeBriefPrefs({ importance: 'highMedium' })), 'High & medium events');
  assert.equal(briefEventsLabel(sanitizeBriefPrefs({ importance: 'all' })), 'Economic events');
});

// ---- wiring -----------------------------------------------------------------

const pop = read('../frontend/src/features/dashboard/BriefSettingsPopover.jsx');
const dash = read('../frontend/src/features/dashboard/Dashboard.jsx');
const app = read('../frontend/src/App.jsx');
const layoutJsx = read('../frontend/src/app/Layout.jsx');
const css = appCss;

test('the gear toggles an anchored popover, not a modal', () => {
  assert.match(dash, /onClick=\{\(\) => setSettingsOpen\(\(o\) => !o\)\}/);
  assert.match(dash, /<BriefSettingsPopover\b[\s\S]*open=\{settingsOpen\}/);
  // Anchored: positioned against the gear's wrapper, with no modal backdrop.
  assert.match(css, /\.bs-anchor \{ position: relative;/);
  assert.match(css, /\.bs-pop \{[\s\S]*position: absolute;/);
  assert.doesNotMatch(pop, /modal-backdrop/, 'must not be a modal');
  assert.doesNotMatch(pop, /className="modal/, 'must not be a modal');
});

test('popover closes on outside click and Escape', () => {
  assert.match(pop, /addEventListener\('mousedown', onDoc\)/);
  assert.match(pop, /e\.key === 'Escape'/);
  assert.match(pop, /removeEventListener\('mousedown', onDoc\)/);
  assert.match(pop, /removeEventListener\('keydown', onKey\)/);
});

test('popover renders the seven sections in the specified order', () => {
  // Read the rendered group headings in source order rather than substring
  // probing, so a label appearing in an aria-label can't fake a match.
  const labels = [...pop.matchAll(/className="bs-group-label"[^>]*>\s*([A-Za-z][A-Za-z ]*?)\s*[\r\n<]/g)]
    .map((m) => m[1].trim());
  assert.deepEqual(labels, ['Sections', 'News importance', 'Currencies', 'Time window', 'Timezone', 'Display']);
  // 7. Reset lives in the pinned footer, below the scrolling body.
  assert.ok(pop.indexOf('Restore defaults') > pop.lastIndexOf('bs-group-label'));
  assert.match(pop, /Select all/);
  assert.match(pop, /Clear all/);
  assert.match(pop, /Hide empty sections/);
});

test('popover is scoped to Today\'s Brief only', () => {
  // Strip comments first: the header comment legitimately NAMES the concerns this
  // panel excludes, and that prose must not trip the check.
  const code = pop.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  for (const forbidden of [
    'dashLayout', 'DASH_WIDGETS', 'moveDashWidget', 'setDashVisible', 'resetDashLayout',
    'theme', 'Theme', 'tradeSettings', 'beRounding', 'accountId', 'setUnit',
  ]) {
    assert.ok(!code.includes(forbidden), `Brief popover must not reference ${forbidden}`);
  }
  // It imports only from its own prefs model — no reach into dashboard or app state.
  const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports.filter((i) => i !== 'react'), ['./briefPrefs.js']);
});

test('unbuilt sections render disabled with a Soon badge', () => {
  assert.match(pop, /disabled=\{soon\}/);
  assert.match(pop, /bs-soon-tag/);
  assert.match(css, /\.bs-opt--soon \{[^}]*cursor: default/);
});

test('brief prefs are global and persisted, not per account scope', () => {
  assert.match(app, /sanitizeBriefPrefs\(viewConfigs\.briefPrefs\)/);
  assert.match(app, /briefPrefs: \{ \.\.\.sanitizeBriefPrefs\(prev\.briefPrefs\), \.\.\.patch \}/);
  assert.doesNotMatch(app, /dashboard: \{ \.\.\.c\.dashboard, briefPrefs/);
  for (const prop of ['briefPrefs', 'patchBriefPrefs', 'setBriefSection', 'resetBriefPrefs']) {
    assert.ok(app.includes(prop), `App.jsx must define ${prop}`);
    assert.ok(layoutJsx.includes(prop), `Layout.jsx must pass ${prop}`);
    assert.ok(dash.includes(prop), `Dashboard.jsx must consume ${prop}`);
  }
});

test('the banner filters and formats through the prefs', () => {
  assert.match(dash, /filterBriefEvents\(events \|\| \[\], prefs, now\)/);
  assert.match(dash, /formatBriefTime\(e\.date, prefs\.timezone, now\)/);
  assert.match(dash, /briefEventsLabel\(prefs\)/);
  // The heading date renders through the same timezone pref as the event times.
  assert.match(dash, /formatBriefDate\(now, prefs\.timezone\)/);
  assert.match(dash, /formatBriefClock\(now, prefs\.timezone\)/);
  assert.match(css, /\.dash-banner-date \{[^}]*margin-right: auto/);
  // Hide-empty gates each section, and the all-hidden case says something.
  assert.match(dash, /briefSectionOn\(prefs, 'events'\) && \(!prefs\.hideEmpty \|\| shown\.length > 0\)/);
  assert.match(dash, /briefSectionOn\(prefs, 'alerts'\) && \(!prefs\.hideEmpty \|\| alerts\.length > 0\)/);
  assert.match(dash, /allQuiet && \(/);
});

test('currencies use two columns on a roomy panel', () => {
  assert.match(css, /\.bs-ccy-grid \{[^}]*grid-template-columns: 1fr 1fr/);
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*?\.bs-ccy-grid \{ grid-template-columns: 1fr; \}/);
});

test('the heading clock ticks, and drives the window filter', () => {
  // A once-computed `new Date()` would freeze the clock at the page-load time, so
  // the banner must own a ticking value...
  assert.match(dash, /function useMinuteClock\(\)/);
  // Scoped to DailyBanner: the Dashboard component has its own unrelated
  // `new Date()` that only seeds the calendar's initial month.
  const banner = dash.slice(dash.indexOf('function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.match(banner, /const now = useMinuteClock\(\);/);
  assert.ok(!/const now = new Date\(\);/.test(banner), 'the banner must not read a frozen clock');
  // ...aligned to the minute boundary rather than 60s from mount,
  assert.match(dash, /60_000 - \(Date\.now\(\) % 60_000\)/);
  // ...cleaned up on unmount,
  assert.match(dash, /clearTimeout\(timeout\); clearInterval\(interval\);/);
  // ...and fed into the filter, so events age out of the window unaided.
  assert.match(dash, /\[events, prefs, now\]/);
});
