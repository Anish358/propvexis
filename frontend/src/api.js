import { io } from 'socket.io-client';

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

export async function fetchTrades(accountId) {
  return getJson(`/api/trades?limit=1000${acctq(accountId)}`);
}

export async function fetchAccount(accountId) {
  return getJson(`/api/account?_=1${acctq(accountId)}`);
}

export async function fetchStats(accountId) {
  return getJson(`/api/stats?_=1${acctq(accountId)}`);
}

export async function fetchYearly(year, accountId) {
  return getJson(`/api/yearly?year=${year}${acctq(accountId)}`);
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
