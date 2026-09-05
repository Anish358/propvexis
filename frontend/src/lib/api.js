import { io } from 'socket.io-client';
import { filtersToQuery } from '../features/filters/filters.js';

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

// Email + password. Both return the user; both throw an Error whose message is
// the server's user-facing string (the auth routes are written to be quotable
// straight into the form).
async function postCredentials(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `request failed (${res.status})`);
  }
  return (await res.json()).user;
}

export const signupWithPassword = ({ name, email, password }) =>
  postCredentials('/api/auth/signup', { name, email, password });

export const loginWithPassword = ({ email, password }) =>
  postCredentials('/api/auth/login', { email, password });

// ---- Email verification + password reset ----
// These four are unauthenticated (or, for the resend, session-authenticated)
// and return plain JSON rather than a user, so they don't go through
// postCredentials. Errors carry the server's user-facing string.
async function postJson(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

/** Ask for a fresh verification email for the logged-in account. */
export const requestVerification = () => postJson('/api/auth/verify/request');

/** Redeem a link from that email. Confirms the address; does NOT log you in. */
export const confirmVerification = (token) => postJson('/api/auth/verify/confirm', { token });

/**
 * Ask for a reset link. Always resolves — the server answers identically for a
 * registered and an unregistered address, so the UI must not imply it knows
 * which one this was.
 */
export const requestPasswordReset = (email) => postJson('/api/auth/password/forgot', { email });

/** Redeem a reset link and set the new password. Returns the logged-in user. */
export const resetPassword = ({ token, password }) =>
  postCredentials('/api/auth/password/reset', { token, password });

export async function logout() {
  await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

// Mark the setup wizard done; returns the updated user (onboarded_at set).
export async function completeOnboarding() {
  const res = await apiFetch('/api/onboarding/complete', { method: 'POST' });
  if (!res.ok) throw new Error(`completeOnboarding ${res.status}`);
  return (await res.json()).user;
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

/**
 * Create an account and everything that must exist with it, atomically
 * (POST /api/accounts/provision). This is what the Add Account wizard calls.
 *
 * Surfaces the SERVER's message rather than a status code, like syncCall below and
 * for the same reason: every failure here is something the user has to act on —
 * a login already registered, a plan cap, Auto Sync not configured on this server.
 *
 * The status and the typed conflict ride on the error because the connect step
 * needs them: a 409 must keep the values the user typed, name the collision and
 * link to the account when it is their own, and none of that can be recovered
 * from a message string.
 */
export async function provisionAccount(payload) {
  const res = await apiFetch('/api/accounts/provision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `could not create the account (${res.status})`);
    err.status = res.status;
    err.conflict = data.conflict;
    throw err;
  }
  // The route replies { account } — and on a provision_key replay it is the
  // EXISTING account with a 200 rather than a 201, which is a success either way.
  return data.account;
}

/**
 * Is this platform login free? (GET /api/accounts/login-available.)
 *
 * Called while the user types, so it NEVER rejects: a failed pre-check resolves
 * to "we do not know" and the step stays usable. The unique index at commit is
 * the real guard — this only spares the user a 409 at the end of a nine-step flow.
 */
export async function checkLoginAvailable(login, platform) {
  try {
    // Held in its own single-quoted const rather than inlined in the template
    // below — a source-text test guards the set of /api/accounts paths this
    // module hits, and a backtick literal wouldn't be visible to it.
    const path = '/api/accounts/login-available';
    const q = new URLSearchParams({ login: String(login), platform: String(platform ?? '') });
    const res = await apiFetch(`${path}?${q}`);
    // `autoSyncConfigured: null` on both unknown paths, spelled out rather than left
    // absent: the connect step hides its server-run branch on `false`, so an ABSENT
    // key and a genuine `false` must not read alike. Unknown means show the branch —
    // the 503 is still behind it.
    if (!res.ok) return { available: null, mine: false, autoSyncConfigured: null };
    return await res.json();
  } catch {
    return { available: null, mine: false, autoSyncConfigured: null };
  }
}

// ---- Server-side MT5 sync (the self-hosted terminal farm) ----
// Unlike the calls above, these surface the SERVER's message rather than a
// generic "name 404". Every failure here is something the user must act on —
// "enter the investor password", "login required for an unbound account", "sync
// not configured" — and a status code tells them none of it.
async function syncCall(path, opts = {}) {
  const res = await apiFetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `sync ${res.status}`);
  return body;
}

export const fetchAccountSync = (id) => syncCall(`/api/accounts/${id}/sync`);

// The investor password goes UP and never comes back down: no read endpoint
// returns it, and the status response carries only metadata.
export const saveAccountCredential = (id, { server, login, firm_key, password }) =>
  syncCall(`/api/accounts/${id}/credentials`, {
    method: 'PUT',
    body: JSON.stringify({ server, login, firm_key, password }),
  });

export const deleteAccountCredential = (id) =>
  syncCall(`/api/accounts/${id}/credentials`, { method: 'DELETE' });

export const syncAccountNow = (id) =>
  syncCall(`/api/accounts/${id}/sync`, { method: 'POST' });

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

// ---- View state (per-user display prefs + filters; synced across devices) ----
// The blob shape is owned by App.jsx; the server stores it opaquely.
export async function fetchViewState() {
  return (await getJson('/api/view-state?_=1')).state || {};
}

export async function saveViewState(state) {
  const res = await apiFetch('/api/view-state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error(`saveViewState ${res.status}`);
  return (await res.json()).state;
}

// ---- Day notes (the Daily Journal's per-SESSION note, keyed YYYY-MM-DD) ----
// One map for every day the user has written, because the journal is a feed and
// asks for a fortnight at a time. Per-trade notes are a different field entirely
// (`comments`, via tagTrade below).
export async function fetchDayNotes() {
  return (await getJson('/api/day-notes?_=1')).notes || {};
}

// An empty note clears the day — the server deletes the row rather than storing
// '', so a cleared day stops counting as journalled.
export async function saveDayNote(day, note) {
  const res = await apiFetch(`/api/day-notes/${day}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(`saveDayNote ${res.status}`);
  return (await res.json()).note;
}

// ---- Notifications (in-app alert feed for the logged-in user) ----
export async function fetchNotifications() {
  return getJson('/api/notifications?_=1');
}

// Upcoming high-impact economic events for the dashboard banner (global feed).
export async function fetchCalendar() {
  return getJson('/api/calendar');
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
// Single account -> its challenge state; several -> { multi:true, accounts:[…] }.
export async function fetchProp(accountId) {
  return getJson(`/api/prop?_=1${acctq(accountId)}`);
}

// Prop OS → Overview: the whole business view in one call. Takes NO account id —
// the route is portfolio-wide by design (see the note on /api/prop/overview), so
// passing the selected account would be a parameter it ignores.
export async function fetchPropOverview() {
  return getJson('/api/prop/overview');
}

// Prop OS → Accounts (Portfolio): every owned account's live rule state plus the
// pass history. Takes NO account id for the same reason the Overview does not —
// the Portfolio is the multi-account view. The Details tab reads fetchProp(login).
export async function fetchPropPortfolio() {
  return getJson('/api/prop/portfolio');
}

/* The multi-account CHALLENGES (migration 0027): one entry per challenge, each with the
 * accounts that are its phases and what each phase did.
 *
 * Portfolio-wide and takes no account id, for the same reason the two above do not — a
 * challenge SPANS accounts, so scoping it to the selected one would hide the phases
 * either side of it. Carries no live figures: those are fetchPropPortfolio's, and both
 * of its callers already hold them. */
export async function fetchChallengeGroups() {
  return getJson('/api/prop/challenges');
}

export async function fetchPropHistory(accountId) {
  return getJson(`/api/prop/history?account_id=${accountId}`);
}

/**
 * THE MANUAL OVERRIDE: settle the account's current phase, or put it back.
 *
 * `{ account_id, status: 'passed' | 'breached' | 'active', reason? }`. It hits the same
 * writer the automatic settlement uses, so a phase closed by hand is the same row as one
 * the engine closed. 'active' REOPENS the last settled phase — the undo an automatic
 * system has to have, because the engine can be wrong about a real account.
 *
 * NOT `advanceChallenge` below, which is the pre-0027 write: that closes the phase AND
 * opens the next one on the SAME account, and since a firm issues a new login per phase
 * that would invent a Phase 2 on the Phase 1 account and swallow the wizard's invitation
 * to add the real one.
 *
 * Surfaces the SERVER's message: a 409 here means "already settled", which is a sentence
 * the user has to read rather than a status code.
 */
export async function settlePhase(fields) {
  const res = await apiFetch('/api/prop/settle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `could not update the phase (${res.status})`);
  return data;
}

// Advance/reset a challenge: close the active one and open the next phase.
//
// THE PRE-0027 WRITE, kept for the firms that keep ONE login across phases (some upgrade
// the account in place rather than issuing a new one). It has no UI today: the Challenges
// card and the Overview both use settlePhase, because the multi-account case is the
// common one and mixing the two would put two different meanings behind one button.
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

/* ---- cTrader --------------------------------------------------------------
 * The trader authorizes on Spotware's own site, so nothing here ever sees a
 * broker password. `startCtraderAuth` returns the grant URL rather than
 * redirecting, which lets the wizard keep its draft in sessionStorage before the
 * browser leaves the app. */
export async function startCtraderAuth() {
  return postJson('/api/ctrader/authorize', {});
}

/** The picker's data. `pending` means the worker has not looked yet — not "none". */
export async function ctraderAccounts(identityId) {
  return getJson(`/api/ctrader/identities/${identityId}/accounts`);
}

/** Provision one PropVexis account per selected cTrader account. */
export async function provisionCtraderAccounts(identityId, payload) {
  return postJson(`/api/ctrader/identities/${identityId}/accounts`, payload);
}
