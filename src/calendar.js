// Economic calendar — high-impact macro events for the dashboard banner.
//
// Data source: the free public ForexFactory weekly JSON feed (faireconomy.media),
// no API key — the same $0-cost ethos as the EA-sourced candles. The feed covers
// roughly the current week; we fetch it at most once per TTL for the whole server
// (it's the same for every user), cache it in-process, and expose only the
// upcoming High-impact events. On a feed error we serve the last good cache, and
// if we have nothing cached we return [] so the banner falls back gracefully.

import { config } from './config.js';

const TTL_MS = 30 * 60 * 1000;       // refresh at most twice an hour
const ERROR_TTL_MS = 5 * 60 * 1000;  // after a total feed failure, back off before retrying
const FETCH_TIMEOUT_MS = 8000;
// Keep events that started within the last hour (still "in play") through the
// rest of the feed window; drop anything older so the banner shows what's next.
const GRACE_MS = 60 * 60 * 1000;

// Pure core (unit-tested): normalize a raw feed array down to the upcoming
// High-impact events, soonest first. `now` is injectable for tests.
export function upcomingHighImpact(raw, now = new Date(), limit = 6) {
  if (!Array.isArray(raw)) return [];
  const cutoff = now.getTime() - GRACE_MS;
  return raw
    .filter((e) => e && String(e.impact).toLowerCase() === 'high')
    .map((e) => ({
      title: e.title ?? '',
      country: e.country ?? '', // currency/region code, e.g. "USD"
      date: e.date ?? '',       // ISO 8601 with tz offset
      forecast: e.forecast ?? '',
      previous: e.previous ?? '',
      ts: Date.parse(e.date),
    }))
    .filter((e) => Number.isFinite(e.ts) && e.ts >= cutoff)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, limit)
    .map(({ ts, ...e }) => e); // ts was only for filter/sort — not part of the API shape
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'PropVexis/1.0 (economic-calendar)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`calendar feed ${url} → ${res.status}`);
  const raw = await res.json();
  return Array.isArray(raw) ? raw : [];
}

let cache = null;      // { fetchedAt, raw } | null
let cooldownUntil = 0; // set after a total failure so we don't refetch on every load

// Cached fetcher used by the route. Fetches every configured feed, merges them,
// and returns the upcoming high-impact events. A single feed failing doesn't sink
// the rest; if every feed fails we keep serving stale cache (or [] when there's
// nothing cached) and back off for ERROR_TTL_MS before retrying — the feed
// rate-limits (HTTP 429), so we must not hammer it on each dashboard load.
export async function getHighImpactEvents(now = new Date()) {
  const urls = config.econCalendarUrls ?? [];
  if (!urls.length) return [];

  const nowMs = Date.now();
  const fresh = cache && nowMs - cache.fetchedAt < TTL_MS;
  if (!fresh && nowMs >= cooldownUntil) {
    const results = await Promise.allSettled(urls.map(fetchFeed));
    const ok = results.filter((r) => r.status === 'fulfilled');
    if (ok.length) {
      cache = { fetchedAt: nowMs, raw: ok.flatMap((r) => r.value) };
      cooldownUntil = 0;
    } else {
      cooldownUntil = nowMs + ERROR_TTL_MS; // serve stale/empty until the backoff clears
    }
  }
  return upcomingHighImpact(cache?.raw ?? [], now);
}
