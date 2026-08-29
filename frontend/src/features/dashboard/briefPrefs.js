// Today's Brief widget preferences.
//
// Scope: this model configures the Today's Brief banner ONLY — which of its
// sections show, and how its economic-event list is filtered and formatted.
// Nothing here touches the dashboard layout, KPI cards, themes or any global
// app setting; those live in dashLayout.js and Settings respectively.
//
// Pure (no React, no DOM) so the banner and the settings popover read identical
// rules and the filtering is unit testable against a fixed `now`.
//
// Stored at the top level of `viewConfigs` as `briefPrefs` — a global user
// preference like `unit`, not per account scope: your news filters shouldn't
// change because you switched trading accounts.

// ---- catalogues -------------------------------------------------------------

// `soon: true` marks a section whose content isn't built yet. The preference is
// already modelled and persisted so each one lights up the day it ships; the
// popover renders those rows disabled with a "Soon" badge rather than offering a
// toggle that visibly does nothing.
export const BRIEF_SECTIONS = [
  { id: 'events', label: 'High Impact Events' },
  { id: 'alerts', label: 'Account Alerts' },
  { id: 'summary', label: 'Daily Summary', soon: true },
  { id: 'session', label: 'Market Session', soon: true },
  { id: 'ai', label: 'AI Briefing', soon: true },
];

export const BRIEF_IMPORTANCE = [
  { id: 'high', label: 'High Impact Only' },
  { id: 'highMedium', label: 'High + Medium' },
  { id: 'all', label: 'All Events' },
];

export const BRIEF_CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY', 'CNY'];

export const BRIEF_WINDOWS = [
  { id: '4h', label: 'Next 4 Hours' },
  { id: 'today', label: 'Today' },
  { id: '24h', label: 'Next 24 Hours' },
  { id: 'week', label: 'This Week' },
];

// Broker Time is deliberately absent: no broker/server offset is stored anywhere
// (not in the DB, not sent by the EA), and guessing one would print the wrong
// time for a release a trader is planning around. Add it here once an offset
// exists per account.
export const BRIEF_TIMEZONES = [
  { id: 'local', label: 'Local Time' },
  { id: 'utc', label: 'UTC' },
];

const SECTION_IDS = BRIEF_SECTIONS.map((s) => s.id);
const IMPORTANCE_IDS = BRIEF_IMPORTANCE.map((i) => i.id);
const WINDOW_IDS = BRIEF_WINDOWS.map((w) => w.id);
const TIMEZONE_IDS = BRIEF_TIMEZONES.map((t) => t.id);

// Which impact labels each importance level admits. Holiday rows ride with
// 'all' only — they're calendar context, not tradeable news.
const IMPACTS_FOR = {
  high: ['high'],
  highMedium: ['high', 'medium'],
  all: ['high', 'medium', 'low', 'holiday'],
};

// ---- defaults + persistence -------------------------------------------------

export const defaultBriefPrefs = () => ({
  sections: { events: true, alerts: true, summary: true, session: true, ai: false },
  importance: 'high',
  currencies: ['USD', 'EUR', 'GBP'],
  window: 'today',
  timezone: 'local',
  hideEmpty: true,
});

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

// Reconcile a persisted blob with the current catalogue: unknown section ids and
// currencies are dropped, enum fields fall back to their default when the saved
// value is no longer valid, and a missing field takes the default. Fail-safe so a
// corrupt blob can never leave the banner unrenderable.
export function sanitizeBriefPrefs(saved) {
  const base = defaultBriefPrefs();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;

  const sections = { ...base.sections };
  if (saved.sections && typeof saved.sections === 'object' && !Array.isArray(saved.sections)) {
    for (const id of SECTION_IDS) {
      if (typeof saved.sections[id] === 'boolean') sections[id] = saved.sections[id];
    }
  }

  // An empty array is a MEANINGFUL saved value here (see filterBriefEvents), so
  // it must survive sanitizing — only a non-array falls back to the default set.
  const currencies = Array.isArray(saved.currencies)
    ? BRIEF_CURRENCIES.filter((c) => saved.currencies.includes(c))
    : base.currencies;

  return {
    sections,
    importance: oneOf(saved.importance, IMPORTANCE_IDS, base.importance),
    currencies,
    window: oneOf(saved.window, WINDOW_IDS, base.window),
    timezone: oneOf(saved.timezone, TIMEZONE_IDS, base.timezone),
    hideEmpty: typeof saved.hideEmpty === 'boolean' ? saved.hideEmpty : base.hideEmpty,
  };
}

export function isDefaultBriefPrefs(prefs) {
  const p = sanitizeBriefPrefs(prefs);
  const d = defaultBriefPrefs();
  return SECTION_IDS.every((id) => p.sections[id] === d.sections[id])
    && p.importance === d.importance
    && p.window === d.window
    && p.timezone === d.timezone
    && p.hideEmpty === d.hideEmpty
    && p.currencies.length === d.currencies.length
    && p.currencies.every((c, i) => c === d.currencies[i]);
}

export const briefSectionOn = (prefs, id) => !!prefs?.sections?.[id];

// ---- event filtering --------------------------------------------------------

export const impactAllowed = (prefs, impact) =>
  (IMPACTS_FOR[prefs?.importance] || IMPACTS_FOR.high).includes(impact || 'low');

// Start/end of the selected window, in ms. All four windows are FORWARD-looking
// from `now` — the feed only carries upcoming events (the route drops anything
// over an hour old), so "Today" means the rest of today, not since midnight.
//
// Day and week boundaries are computed in the display timezone: with UTC
// selected, "Today" ends at 00:00Z, which is the same instant the times on
// screen roll over. Using local boundaries while printing UTC times would show
// a "Today" list running past the visible date change.
export function briefWindowRange(prefs, now = new Date(), timezone = prefs?.timezone) {
  const from = now.getTime();
  const utc = timezone === 'utc';
  const endOfDay = () => {
    const d = new Date(from);
    if (utc) d.setUTCHours(24, 0, 0, 0); else d.setHours(24, 0, 0, 0);
    return d.getTime();
  };
  switch (prefs?.window) {
    case '4h': return { from, to: from + 4 * 3600e3 };
    case '24h': return { from, to: from + 24 * 3600e3 };
    case 'week': {
      // Through the end of the 7th day, so "This Week" covers the feed's window
      // rather than cutting off mid-day-7.
      return { from, to: endOfDay() + 6 * 86400e3 };
    }
    case 'today':
    default: return { from, to: endOfDay() };
  }
}

// Apply importance + currency + time window to the raw event list.
//
// NOTE the currency rule: an EMPTY selection means "show nothing", not "no
// filter". That's the opposite of the convention in filters.js (where an empty
// array means unfiltered), and it's deliberate — the user asked that clearing
// every currency produce an empty state rather than silently firehosing every
// event on the calendar. Callers distinguish the two empties via
// `briefEmptyReason`.
export function filterBriefEvents(events, prefs, now = new Date()) {
  if (!Array.isArray(events)) return [];
  const p = sanitizeBriefPrefs(prefs);
  if (p.currencies.length === 0) return [];
  const { from, to } = briefWindowRange(p, now);
  // `from` is inclusive of in-play events: the route already keeps anything that
  // started within the last hour, and dropping them here would hide a release
  // that's happening right now.
  const graceFrom = from - 3600e3;
  return events.filter((e) => {
    if (!e) return false;
    if (!impactAllowed(p, e.impact)) return false;
    if (!p.currencies.includes(e.country)) return false;
    const ts = Date.parse(e.date);
    return Number.isFinite(ts) && ts >= graceFrom && ts <= to;
  });
}

// Why the event list is empty, so the banner can say something useful instead of
// a generic "nothing found". null when there are events to show.
export function briefEmptyReason(events, prefs, now = new Date()) {
  const p = sanitizeBriefPrefs(prefs);
  if (p.currencies.length === 0) return 'no-currencies';
  if (filterBriefEvents(events, p, now).length > 0) return null;
  // Something is available but this filter combination excludes all of it —
  // worth distinguishing from "the feed itself is empty/down".
  return Array.isArray(events) && events.length > 0 ? 'filtered-out' : 'no-events';
}

// ---- formatting -------------------------------------------------------------

// Today's day + date for the banner heading, e.g. "Tuesday, Jul 28".
//
// Follows the SAME timezone pref as the event times below it: with UTC selected,
// a viewer whose local clock has already rolled past midnight would otherwise see
// a heading date that disagrees with the times listed under it.
export function formatBriefDate(now = new Date(), timezone = 'local') {
  const utc = timezone === 'utc';
  return now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
    ...(utc ? { timeZone: 'UTC' } : {}),
  });
}

/* The wall clock for the brief's heading, e.g. "14:42:07".
 *
 * 24-HOUR WITH SECONDS as of 2026-08-29 (Rhea; was "3:42 PM"). Both halves are the
 * design's and both are right for this app: every other time on this screen — an event
 * release, a session, a drawdown reset — is written 24-hour, and a clock in a different
 * convention beside them is one more conversion to do under pressure. The seconds are
 * what make it read as a LIVE clock rather than a timestamp of when the page loaded,
 * which matters on a card whose whole job is "what is about to happen".
 *
 * UTC gets an explicit suffix: with that mode selected every time in the widget is UTC,
 * and the clock is the natural place to say so — otherwise a viewer sees a time that
 * silently disagrees with the one on their taskbar. */
export function formatBriefClock(now = new Date(), timezone = 'local') {
  const utc = timezone === 'utc';
  const t = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    ...(utc ? { timeZone: 'UTC' } : {}),
  });
  return utc ? `${t} UTC` : t;
}

// The events section's own label tracks the importance setting — leaving it
// reading "High-impact events" while the list also carries medium/low ones would
// misdescribe what's on screen.
export function briefEventsLabel(prefs) {
  switch (sanitizeBriefPrefs(prefs).importance) {
    case 'all': return 'Economic events';
    case 'highMedium': return 'High & medium events';
    default: return 'High-impact events';
  }
}

// Event time in the selected timezone. Same-day events show just the time;
// anything further out is prefixed with its weekday, so a "This Week" list
// stays readable. `now` is injectable for tests.
export function formatBriefTime(iso, timezone = 'local', now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const utc = timezone === 'utc';
  /* 24-HOUR, MATCHING THE CLOCK ABOVE IT (2026-08-29, Rhea). These sit in the same
     column as a heading clock written 14:42:07; leaving them at "7:00 PM" put two time
     conventions four inches apart on a card whose job is to answer "what is about to
     happen, and how long have I got". That is the conversion this design set out to
     remove, not to relocate. */
  const opts = {
    hour: '2-digit', minute: '2-digit', hour12: false, ...(utc ? { timeZone: 'UTC' } : {}),
  };
  const time = d.toLocaleTimeString('en-US', opts);
  const sameDay = utc
    ? d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate()
    : d.toDateString() === now.toDateString();
  if (sameDay) return time;
  const day = d.toLocaleDateString('en-US', { weekday: 'short', ...(utc ? { timeZone: 'UTC' } : {}) });
  return `${day} ${time}`;
}

/**
 * THE FALLBACK LIST, for when the user's own filter matches nothing.
 *
 * `filterBriefEvents` narrows by importance, currency AND time window, and the window
 * is usually a few hours — so on a quiet afternoon, or at 6pm on a Friday, the column
 * is legitimately empty and the card has nothing to say. That is honest and it is also
 * useless: the question a trader is asking is "what is coming that could move this
 * against me", and "nothing in the next four hours" is only half an answer.
 *
 * So when the narrow list is empty, this returns the next HIGH-IMPACT events from the
 * whole feed, ignoring the window and the importance setting — the ones that would end
 * a session — while still respecting the CURRENCIES the user chose, because those are a
 * statement about what they trade rather than about when they are looking.
 *
 * Deliberately not merged into filterBriefEvents: the caller has to know which list it
 * is showing so it can say so. A fallback that silently looks like the real list
 * teaches the trader that their window setting does nothing.
 */
export function fallbackBriefEvents(events, prefs, now = new Date(), limit = 4) {
  const p = sanitizeBriefPrefs(prefs);
  if (!Array.isArray(events) || p.currencies.length === 0) return [];
  const from = now.getTime();
  return events
    .filter((e) => {
      const t = new Date(e.date).getTime();
      if (!Number.isFinite(t) || t < from) return false;
      if (!p.currencies.includes(e.country)) return false;
      // High only. A fallback that admits medium and low is just a wider window, and
      // the point of it is "the things that matter, whenever they are".
      return (e.impact || '').toLowerCase() === 'high';
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, limit);
}

/* ---- SAMPLE EVENTS — DEVELOPMENT BUILDS ONLY --------------------------------
 *
 * WHY THIS IS GATED AND NOT JUST SEEDED. These are invented economic releases. A trader
 * who reads "USD Non-Farm Employment Change 13:30" on a dashboard will plan a session
 * around it — that is the entire purpose of the card — and being wrong about when the
 * market moves is not a cosmetic bug. So they exist to make the design visible while
 * building it and must never reach anyone's real screen.
 *
 * The gate is the CALLER's (`import.meta.env.DEV`, which Vite statically replaces with
 * `false` in a production build, so a bundler drops this branch entirely). This function
 * stays pure and dateless — it takes `now` and generates times relative to it, so the
 * list is always plausibly "upcoming" whenever you happen to look, and node:test can
 * assert on it without a clock.
 *
 * Real-looking on purpose: sample data that says "Event One" tells you nothing about
 * whether a title truncates at 380px. The FALLBACK NOTE that renders alongside is what
 * says they are samples.
 */
export function sampleBriefEvents(now = new Date()) {
  const at = (hours, minutes = 0) => {
    const d = new Date(now.getTime() + hours * 3600_000);
    d.setMinutes(minutes, 0, 0);
    return d.toISOString();
  };
  return [
    { title: 'Core CPI m/m', country: 'USD', impact: 'high', date: at(2, 30) },
    { title: 'FOMC Statement', country: 'USD', impact: 'high', date: at(5, 0) },
    { title: 'ECB President Speaks', country: 'EUR', impact: 'medium', date: at(7, 15) },
    { title: 'Retail Sales m/m', country: 'GBP', impact: 'medium', date: at(9, 30) },
  ];
}
