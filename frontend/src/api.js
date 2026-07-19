import { io } from 'socket.io-client';
import { filtersToQuery } from './filters.js';

// Empty default => relative same-origin URLs, so the session cookie is sent.
// Dev: Vite proxies /api + /socket.io to :3000. Prod: Caddy serves UI + API on
// the same origin. (.env.production may still set an absolute same-origin URL.)
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

// A 401 from any data call means the session expired/was cleared. The auth
// layer registers a handler here so it can drop the user back to /login.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// fetch wrapper: always sends credentials; routes 401s to the auth handler.
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, { credentials: 'include', ...opts });
  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized();
    throw new Error('unauthorized');
  }
  return res;
}

async function getJson(path) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

// ---- Auth ----
export async function fetchMe() {
  // Returns the user, or null if not logged in (401 is expected here, not an error).
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`fetchMe ${res.status}`);
  return (await res.json()).user;
}

export async function loginWithGoogle(credential) {
  const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `login ${res.status}`);
  }
  return (await res.json()).user;
}

export async function logout() {
  await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

// ---- Data (all scoped to the logged-in user; optional accountId selects one) ----
const acctq = (accountId) => (accountId && accountId !== 'all' ? `&account_id=${accountId}` : '');

export async function fetchAccounts() {
  return getJson('/api/accounts');
}

export async function createAccount(fields) {
  const res = await apiFetch('/api/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`createAccount ${res.status}`);
  return res.json();
}

export async function updateAccount(id, fields) {
  const res = await apiFetch(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`updateAccount ${res.status}`);
  return res.json();
}

export async function deleteAccount(id) {
  const res = await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteAccount ${res.status}`);
  return res.json();
}

// ---- Strategies (the user's managed strategy catalog; scoped to the user) ----
export async function fetchStrategies() {
  return getJson('/api/strategies');
}

export async function createStrategy(fields) {
  const res = await apiFetch('/api/strategies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `createStrategy ${res.status}`);
  return res.json();
}

export async function updateStrategy(id, fields) {
  const res = await apiFetch(`/api/strategies/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `updateStrategy ${res.status}`);
  return res.json();
}

export async function deleteStrategy(id) {
  const res = await apiFetch(`/api/strategies/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteStrategy ${res.status}`);
  return res.json();
}

// ---- Payouts (funded-account profit withdrawals; scoped like trades) ----
export async function fetchPayouts(accountId) {
  return getJson(`/api/payouts?_=1${acctq(accountId)}`);
}

export async function createPayout(fields) {
  const res = await apiFetch('/api/payouts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `createPayout ${res.status}`);
  return res.json();
}

export async function deletePayout(id) {
  const res = await apiFetch(`/api/payouts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deletePayout ${res.status}`);
  return res.json();
}

// ---- Fees (eval/reset/activation fees paid to a prop firm; scoped like payouts) ----
export async function fetchFees(accountId) {
  return getJson(`/api/fees?_=1${acctq(accountId)}`);
}

export async function createFee(fields) {
  const res = await apiFetch('/api/fees', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `createFee ${res.status}`);
  return res.json();
}

export async function deleteFee(id) {
  const res = await apiFetch(`/api/fees/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteFee ${res.status}`);
  return res.json();
}

// Prop finance summary (spent/earned/net/roiPct + byFirm) for the scope.
export async function fetchPropFinance(accountId) {
  return getJson(`/api/prop/finance?_=1${acctq(accountId)}`);
}

// Passing & breach insights (pass rates + breach patterns) for the scope.
export async function fetchPropInsights(accountId) {
  return getJson(`/api/prop/insights?_=1${acctq(accountId)}`);
}

// ---- Notifications (in-app alert feed for the logged-in user) ----
export async function fetchNotifications() {
  return getJson('/api/notifications?_=1');
}

export async function markNotificationsRead(body) {
  const res = await apiFetch('/api/notifications/read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`markNotificationsRead ${res.status}`);
  return res.json();
}

// ---- Prop OS (challenge / drawdown / rule state; scoped like account) ----
// Single account -> its challenge state; god view -> { god:true, accounts:[…] }.
export async function fetchProp(accountId) {
  return getJson(`/api/prop?_=1${acctq(accountId)}`);
}

export async function fetchPropHistory(accountId) {
  return getJson(`/api/prop/history?account_id=${accountId}`);
}

// Advance/reset a challenge: close the active one and open the next phase.
export async function advanceChallenge(fields) {
  const res = await apiFetch('/api/prop/advance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `advanceChallenge ${res.status}`);
  return res.json();
}

// Backend origin (scheme://host[:port]) — whitelisting this in MT5 covers every
// /api path the EA calls (both /api/trades/ingest and /api/payouts/ingest).
export const INGEST_ORIGIN = BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

// Full ingest URL to show in the EA setup instructions.
export const INGEST_URL = `${INGEST_ORIGIN}/api/trades/ingest`;

// Direct download for the MQL5 EA source (served by the backend).
export const EA_DOWNLOAD_URL = `${BACKEND_URL}/api/ea/download`;

export async function fetchTrades(accountId) {
  return getJson(`/api/trades?limit=1000${acctq(accountId)}`);
}

// Trade replay: M1 bars around a trade + its entry/exit/SL/TP overlay. Returns
// { available, pending, window, trade, candles } — see GET /api/trades/:id/replay.
// `available:false` for imported/manual trades (no prices); `pending:true` while
// the EA is still delivering candles for a live trade (client should re-poll).
export async function fetchReplay(id) {
  return getJson(`/api/trades/${id}/replay?_=1`);
}

export async function fetchAccount(accountId) {
  return getJson(`/api/account?_=1${acctq(accountId)}`);
}

// `beRound` mirrors the Trade Settings precision control: when on, the server
// snaps near-zero Fixed R to breakeven before aggregating (same rule as the client).
const beq = (beRound) => (beRound ? '&beRound=1' : '');

export async function fetchStats(accountId, unit = 'R', filters, beRound = false) {
  return getJson(`/api/stats?_=1&unit=${unit}${acctq(accountId)}${filtersToQuery(filters)}${beq(beRound)}`);
}

export async function fetchYearly(year, accountId, unit = 'R', filters, beRound = false) {
  return getJson(`/api/yearly?year=${year}&unit=${unit}${acctq(accountId)}${filtersToQuery(filters)}${beq(beRound)}`);
}

// Reports (V1) — the composed Journal+Prop+payouts payload for the current scope.
const reportQuery = (accountId, unit, filters, beRound, year) =>
  `year=${year}&unit=${unit}${acctq(accountId)}${filtersToQuery(filters)}${beq(beRound)}`;

export async function fetchReport(accountId, unit = 'R', filters, beRound = false, year) {
  return getJson(`/api/report?_=1&${reportQuery(accountId, unit, filters, beRound, year)}`);
}

// URL for the CSV export (same scope/params). Fetched with credentials by the
// download button, mirroring the EA-download blob idiom.
export function reportCsvUrl(accountId, unit = 'R', filters, beRound = false, year) {
  return `${BACKEND_URL}/api/report/export.csv?${reportQuery(accountId, unit, filters, beRound, year)}`;
}

export async function createManualTrade(fields) {
  const res = await apiFetch('/api/trades', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `createManualTrade ${res.status}`);
  }
  return res.json();
}

// ---- Billing (Razorpay) ----
export async function fetchBillingConfig() { return getJson('/api/billing/config'); }
export async function fetchSubscription() { return getJson('/api/billing/subscription'); }

export async function startSubscription(plan) {
  const res = await apiFetch('/api/billing/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `subscribe failed (${res.status})`);
  return data;
}

export async function cancelSubscription() {
  const res = await apiFetch('/api/billing/cancel', { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `cancel failed (${res.status})`);
  return data;
}

// CSV import. dryRun=true previews (columns/warnings/counts) without saving;
// dryRun=false imports and returns { imported, ... }.
export async function importTrades(csv, dryRun, accountId) {
  const account_id = accountId && accountId !== 'all' ? Number(accountId) : null;
  const res = await apiFetch('/api/trades/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv, dryRun, account_id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `import failed (${res.status})`);
  return data;
}

export async function tagTrade(id, fields) {
  const res = await apiFetch(`/api/trades/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`tagTrade ${res.status}`);
  return res.json();
}

export async function deleteTrade(id) {
  const res = await apiFetch(`/api/trades/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteTrade ${res.status}`);
  return res.json();
}

export function connectSocket(onUpsert, onUpdate) {
  // withCredentials so the session cookie rides the WebSocket handshake (the
  // backend authenticates the socket and joins it to its account rooms).
  const socket = io(BACKEND_URL || undefined, { withCredentials: true });
  socket.on('trade:upserted', onUpsert);
  socket.on('trade:updated', onUpdate);
  return socket;
}
