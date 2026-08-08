// Smoke test: connect a WebSocket client, POST a sample trade to /ingest,
// and confirm the live broadcast arrives. Run the server first (npm run dev).
import { io } from 'socket.io-client';
import { config } from '../src/platform/config.js';

const base = `http://127.0.0.1:${config.port}`;

const sample = {
  mt5_ticket: Math.floor(Date.now() / 1000), // unique-ish ticket per run
  account_id: 123456,
  symbol: 'EURUSD',
  direction: 'buy',
  open_time: '2026-06-24T13:15:00Z',
  close_time: '2026-06-24T14:02:00Z',
  entry_price: 1.08120,
  sl_price: 1.08009, // ~11.1 pips risk
  tp_price: 1.08342,
  exit_price: 1.08009, // closed at SL -> ~ -1R
  volume: 0.5,
  commission: -1.4,
  pnl_money: -55.5,
  mfe_pips: 4.4,
};

const socket = io(base, { transports: ['websocket'] });

socket.on('connect', async () => {
  console.log('ws connected:', socket.id);

  const res = await fetch(`${base}/api/trades/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ingest-token': config.ingestToken,
    },
    body: JSON.stringify(sample),
  });
  const body = await res.json();
  console.log('POST /ingest ->', res.status);
  console.log('stored trade:', {
    id: body.id,
    symbol: body.symbol,
    session: body.session,
    sl_size_pips: body.sl_size_pips,
    max_r: body.max_r,
    fixed_r: body.fixed_r,
  });
});

socket.on('trade:upserted', (trade) => {
  console.log('>> received trade:upserted broadcast for ticket', trade.mt5_ticket);
  console.log('SMOKE TEST PASSED');
  socket.close();
  // Delay exit so piped stdout flushes before the process tears down.
  setTimeout(() => process.exit(0), 100);
});

setTimeout(() => {
  console.error('timed out waiting for broadcast');
  process.exit(1);
}, 5000);
