import { io } from 'socket.io-client';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export async function fetchTrades() {
  const res = await fetch(`${BACKEND_URL}/api/trades?limit=1000`);
  if (!res.ok) throw new Error(`fetchTrades ${res.status}`);
  return res.json();
}

export async function fetchAccount() {
  const res = await fetch(`${BACKEND_URL}/api/account`);
  if (!res.ok) throw new Error(`fetchAccount ${res.status}`);
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${BACKEND_URL}/api/stats`);
  if (!res.ok) throw new Error(`fetchStats ${res.status}`);
  return res.json();
}

export async function fetchYearly(year) {
  const res = await fetch(`${BACKEND_URL}/api/yearly?year=${year}`);
  if (!res.ok) throw new Error(`fetchYearly ${res.status}`);
  return res.json();
}

export async function tagTrade(id, fields) {
  const res = await fetch(`${BACKEND_URL}/api/trades/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`tagTrade ${res.status}`);
  return res.json();
}

export async function deleteTrade(id) {
  const res = await fetch(`${BACKEND_URL}/api/trades/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteTrade ${res.status}`);
  return res.json();
}

export function connectSocket(onUpsert, onUpdate) {
  const socket = io(BACKEND_URL, { transports: ['websocket'] });
  socket.on('trade:upserted', onUpsert);
  socket.on('trade:updated', onUpdate);
  return socket;
}
