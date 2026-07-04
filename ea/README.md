# Amey Journal — MT5 Expert Advisor (Step 2)

`AmeyJournal.mq5` pushes every closed trade to the backend the instant it closes,
with live-tracked MFE (Max Favorable Excursion).

## What it does
- **Discovers** open positions (manual or EA-placed, **any symbol**) to capture the
  entry price and stop-loss while the trade is live.
- **On close** (`OnTradeTransaction`), POSTs the trade immediately (SL Size + Fixed R
  appear right away), with **MFE pending**.
- **Finalizes MFE from price history**: MFE = the maximum the price ran in your favor,
  measured from entry **until price returns to breakeven (your entry price)** —
  regardless of when you exited. The EA re-reads M1 candles from entry and, once price
  comes back to breakeven (or `InpMfeMaxHours` elapses), sends the true MFE / Max R.
  This matches reading the chart by hand after the trade, and correctly captures a
  winner that runs far past your 2R target.
- **Retry queue**: a failed send is written to `amey_journal_pending.txt` and retried.
  Pending MFE finalizations are persisted to `amey_journal_mfe.txt` and survive restarts.

The EA sends raw prices + the favorable price excursion; the backend converts to pips/R
using one symbol-aware rule (`src/derive.js`) so the pip convention matches your sheet.
Once MFE is finalized it is never overwritten by a later metric-less send.

## Install (Windows MT5)
1. In MetaTrader 5: **File → Open Data Folder → MQL5 → Experts**, copy
   `AmeyJournal.mq5` there.
2. In **MetaEditor**, open it and press **Compile** (F7).
3. **Whitelist the backend URL** (required for `WebRequest`):
   **Tools → Options → Expert Advisors → "Allow WebRequest for listed URL"**, add the
   host, e.g. `http://127.0.0.1:3000` for local, or your deployed `https://...` URL.
4. Drag the EA onto **any one chart**. In the dialog set the inputs and ensure
   **"Allow Algo Trading"** is on. One instance on one chart covers all symbols.

## Inputs
| Input | Default | Meaning |
|-------|---------|---------|
| `InpBackendUrl`   | `http://127.0.0.1:3000/api/trades/ingest` | Ingest endpoint (must be whitelisted) |
| `InpIngestToken`  | `dev-token-please-change` | Must equal backend `INGEST_TOKEN` in `.env` |
| `InpPollMs`       | `500` | Position-discovery poll interval (ms) |
| `InpRetrySecs`    | `15` | Retry-queue flush interval (s) |
| `InpMfeCheckSecs` | `60` | How often to try finalizing pending MFE (s) |
| `InpMfeMaxHours`  | `72` | Stop waiting for price to return to breakeven after N hours, then finalize MFE with the peak so far |
| `InpBackfillDays` | `0` | On startup, send closes missed while the terminal was off, from the last N days. **0 = off** (default), so it never re-dumps pre-install history |
| `InpEquitySecs`   | `300` | Floating balance/equity snapshot interval (s). **0 = off.** Powers true floating drawdown in Prop OS; derived endpoint `…/api/equity/ingest` (same host, already whitelisted) |

## Payload it sends
```json
{
  "mt5_ticket": 123456, "account_id": 5000,
  "symbol": "EURUSD", "direction": "buy",
  "open_time": "2026-06-24T13:15:00Z", "close_time": "2026-06-24T14:02:00Z",
  "entry_price": 1.08120, "sl_price": 1.08009, "tp_price": 1.08342,
  "exit_price": 1.08342, "volume": 0.5, "commission": -1.40,
  "pnl_money": 111.00, "mfe_price": 0.00044
}
```

## Notes & limitations
- **Run the terminal 24/5** (a Windows VPS) so it captures every close, including
  trades closed by SL/TP while your PC is off.
- **Times** are converted from broker-server time to UTC using
  `TimeTradeServer() - TimeGMT()`. Session is a UTC-hour heuristic you can override
  per-trade in the app.
- If the EA is started **after** a position is already open, it seeds tracking on init,
  but MFE before that moment is not captured (it only sees price from start onward).
- **Backfill of offline closes** (`InpBackfillDays > 0`): on startup the EA scans that
  many days of history and sends any closed trade it hadn't already sent (tracked in
  `amey_journal_sent.txt`). MFE is still computed from history for these; but SL is
  best-effort from the opening order, so if your broker doesn't store it, Max R/Fixed R
  stay blank. **Default is 0 (off)** — turn it on only to recover a known gap, or it will
  pull every trade in the window (including ones already in your sheet).
- **MFE timing**: a row appears instantly on close with SL Size + Fixed R; the MFE / Max R
  fill in a bit later (once price returns to breakeven, checked every `InpMfeCheckSecs`).
- Compile on Windows MetaEditor — MQL5 cannot be compiled on macOS. The JSON contract
  is verified separately by `npm run test:ea` against the backend.

## Verify the contract (no MT5 needed)
With the backend running:
```bash
node scripts/test-ea-payload.js   # POSTs the exact EA JSON, checks derived pips/R
```
