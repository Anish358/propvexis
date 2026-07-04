//+------------------------------------------------------------------+
//|                                                  AmeyJournal.mq5  |
//|   Pushes every closed trade to the Amey Journal backend.         |
//|                                                                  |
//|   MFE (Max Favorable Excursion) is the most a trade ran in your   |
//|   favor over its whole life — from entry until the trade closes   |
//|   (TP, SL, or manual exit), in pips and floored at 0 (if it      |
//|   never went green, MFE is 0). The peak is known only after the  |
//|   move completes, so the EA:                                      |
//|     1. sends the trade immediately on close (SL Size + Fixed R), |
//|        with MFE pending;                                          |
//|     2. re-reads M1 over [entry, close] and reports the peak     |
//|        favorable excursion (MFE) and Max R for that trade.       |
//|                                                                  |
//|   Failed sends are queued to a file and retried.                 |
//|                                                                  |
//|   PAYOUTS: balance operations (DEAL_TYPE_BALANCE) with a negative |
//|   amount are treated as profit withdrawals (prop payouts) and     |
//|   pushed to /api/payouts/ingest, deduped by deal ticket. Deposits |
//|   / positive balance ops are ignored.                             |
//|                                                                  |
//|   CANDLES (trade replay): the backend queues the M1 window around |
//|   each closed trade; the EA polls /api/candles/requests, reads    |
//|   the bars from terminal history (CopyRates), and POSTs them to   |
//|   /api/candles/ingest in chunks. Idempotent server-side, so       |
//|   re-serving a window is harmless.                                |
//|                                                                  |
//|   SETUP (one-time): MT5 -> Tools -> Options -> Expert Advisors -> |
//|   tick "Allow WebRequest for listed URL" and add the backend host |
//|   (one host covers the trades, payouts and candles endpoints).    |
//+------------------------------------------------------------------+
#property copyright "Amey Journal"
#property version   "1.13"
#property strict

input string InpBackendUrl   = "http://127.0.0.1:3000/api/trades/ingest"; // Ingest Endpoint
input string InpIngestToken  = "dev-token-please-change";                  // Ingest Token
input int    InpPollMs       = 500;                                        // Position-discovery poll interval (ms)
input int    InpRetrySecs    = 15;                                         // Retry queue flush interval (s)
input int    InpMfeCheckSecs = 60;                                         // How often to try finalizing MFE (s)
input int    InpMfeMaxHours  = 72;                                         // Stop waiting for breakeven after N hours
input int    InpBackfillDays = 0;                                          // On start, backfill closes from last N days (0 = off)
input int    InpSlCaptureSecs = 120;                                       // Capture the stop loss this many secs after open, then freeze it
input int    InpCandleChunk  = 300;                                        // Replay candles per POST (chunk size)
input int    InpEquitySecs   = 300;                                        // Equity snapshot interval (s, 0 = off) — powers floating drawdown

//--- per-open-position tracking (to capture entry/SL while the trade is live)
struct PosTrack
  {
   ulong    ticket;
   string   symbol;
   long     type;
   double   entry;
   double   sl;
   double   tp;
   double   volume;
   datetime openTime;
   bool     slLocked;   // once true, sl is frozen (captured at openTime + InpSlCaptureSecs)
  };
PosTrack g_pos[];

//--- closed trades awaiting MFE finalization (persisted across restarts)
struct MfeWatch
  {
   ulong    ticket;
   string   symbol;
   string   direction;
   datetime openTime;
   datetime closeTime;
   double   entry, sl, tp, exit, volume, commission, pnl;
   int      digits;
  };
MfeWatch g_mfe[];

int      g_gmtOffsetSec = 0;
string   g_queueFile    = "amey_journal_pending.txt";
string   g_sentFile     = "amey_journal_sent.txt";
string   g_mfeFile      = "amey_journal_mfe.txt";
ulong    g_sent[];
datetime g_lastFlush    = 0;
datetime g_lastMfeCheck = 0;

//--- payouts (balance-operation withdrawals): derived endpoint + dedup/retry
string   g_payoutUrl        = "";
string   g_payoutQueueFile  = "amey_journal_payouts_pending.txt";
string   g_payoutSentFile   = "amey_journal_payouts_sent.txt";
ulong    g_payoutSent[];

//--- trade-replay candles: derived endpoints (server holds the request queue)
string   g_candleUrl    = "";
string   g_candleReqUrl = "";
//--- floating-equity snapshots: derived endpoint + last-sent clock
string   g_equityUrl    = "";
datetime g_lastEquity   = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   g_gmtOffsetSec = (int)(TimeTradeServer() - TimeGMT());
   g_payoutUrl = InpBackendUrl;
   if(StringFind(g_payoutUrl, "/api/trades/ingest") >= 0)
      StringReplace(g_payoutUrl, "/api/trades/ingest", "/api/payouts/ingest");
   else
      StringReplace(g_payoutUrl, "trades", "payouts"); // fallback for non-standard URLs
   g_candleUrl = InpBackendUrl;
   if(StringFind(g_candleUrl, "/api/trades/ingest") >= 0)
      StringReplace(g_candleUrl, "/api/trades/ingest", "/api/candles/ingest");
   else
      StringReplace(g_candleUrl, "trades", "candles");
   g_candleReqUrl = g_candleUrl;
   StringReplace(g_candleReqUrl, "/ingest", "/requests");
   g_equityUrl = InpBackendUrl;
   if(StringFind(g_equityUrl, "/api/trades/ingest") >= 0)
      StringReplace(g_equityUrl, "/api/trades/ingest", "/api/equity/ingest");
   else
      StringReplace(g_equityUrl, "trades", "equity");
   LoadSent();
   LoadPayoutSent();
   LoadMfeWatch();
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong t = PositionGetTicket(i);
      if(t > 0 && PositionSelectByTicket(t))
         TrackPosition(t);
     }
   EventSetMillisecondTimer(InpPollMs);
   PrintFormat("AmeyJournal EA v1.13 started. Open=%d, MFE-pending=%d. Endpoint=%s",
               ArraySize(g_pos), ArraySize(g_mfe), InpBackendUrl);
   ScanPayoutHistory(); // import past withdrawals/payouts (deduped) regardless of backfill
   if(InpBackfillDays > 0)
      BackfillHistory();
   FinalizePendingMfe();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) { EventKillTimer(); }

//+------------------------------------------------------------------+
void OnTimer()
  {
   DiscoverNewPositions();

   if(TimeLocal() - g_lastFlush >= InpRetrySecs)
     { g_lastFlush = TimeLocal(); FlushQueue(); FlushPayoutQueue(); ServeCandleRequests(); }

   if(TimeLocal() - g_lastMfeCheck >= InpMfeCheckSecs)
     { g_lastMfeCheck = TimeLocal(); FinalizePendingMfe(); }

   if(InpEquitySecs > 0 && TimeLocal() - g_lastEquity >= InpEquitySecs)
     { g_lastEquity = TimeLocal(); SendEquity(); }
  }

//+------------------------------------------------------------------+
//| Floating equity snapshot -> /api/equity/ingest. Sampled on a     |
//| timer so the server can compute true intraday/floating drawdown  |
//| (not just realized end-of-trade equity). Best-effort: a missed   |
//| send is fine, the next tick covers it.                           |
//+------------------------------------------------------------------+
void SendEquity()
  {
   string json = "{";
   json += "\"account_id\":" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)) + ",";
   json += "\"ts\":"         + IntegerToString((long)TimeGMT()) + ",";
   json += "\"balance\":"    + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   json += "\"equity\":"     + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   json += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\"";
   json += "}";
   PostJson(g_equityUrl, json);
  }

//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(trans.deal)) return;
   // Balance operations (deposits/withdrawals) arrive as DEAL_TYPE_BALANCE deals,
   // not position closes. A negative amount is a withdrawal = a prop payout.
   if(HistoryDealGetInteger(trans.deal, DEAL_TYPE) == DEAL_TYPE_BALANCE)
     { ProcessPayoutDeal(trans.deal); return; }
   long entryType = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(entryType != DEAL_ENTRY_OUT && entryType != DEAL_ENTRY_OUT_BY) return;
   ulong positionId = (ulong)HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
   HandleClose(positionId, trans.deal);
  }

//+------------------------------------------------------------------+
//| Open-position tracking (captures entry/SL/TP while live)         |
//+------------------------------------------------------------------+
int FindTrack(ulong ticket)
  {
   for(int i = 0; i < ArraySize(g_pos); i++)
      if(g_pos[i].ticket == ticket) return i;
   return -1;
  }

void TrackPosition(ulong ticket)
  {
   if(FindTrack(ticket) >= 0) return;
   int n = ArraySize(g_pos);
   ArrayResize(g_pos, n + 1);
   g_pos[n].ticket   = ticket;
   g_pos[n].symbol   = PositionGetString(POSITION_SYMBOL);
   g_pos[n].type     = PositionGetInteger(POSITION_TYPE);
   g_pos[n].entry    = PositionGetDouble(POSITION_PRICE_OPEN);
   g_pos[n].sl       = PositionGetDouble(POSITION_SL);
   g_pos[n].tp       = PositionGetDouble(POSITION_TP);
   g_pos[n].volume   = PositionGetDouble(POSITION_VOLUME);
   g_pos[n].openTime = (datetime)PositionGetInteger(POSITION_TIME);
   g_pos[n].slLocked = false;   // sl tracks live until InpSlCaptureSecs after open
   SymbolSelect(g_pos[n].symbol, true);
  }

void RemoveTrack(int idx)
  {
   int last = ArraySize(g_pos) - 1;
   if(idx < 0 || idx > last) return;
   g_pos[idx] = g_pos[last];
   ArrayResize(g_pos, last);
  }

void DiscoverNewPositions()
  {
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !PositionSelectByTicket(t)) continue;
      int idx = FindTrack(t);
      if(idx < 0) TrackPosition(t);
      else
        {
         // Track the live stop until InpSlCaptureSecs after open, then freeze
         // it — so the logged SL is the stop in force ~2 min in, not a later
         // breakeven/trail move. (If the trade closes before then, the last
         // tracked value is used.)
         if(!g_pos[idx].slLocked)
           {
            g_pos[idx].sl = PositionGetDouble(POSITION_SL);
            if(TimeCurrent() - g_pos[idx].openTime >= (datetime)InpSlCaptureSecs)
               g_pos[idx].slLocked = true;
           }
         g_pos[idx].tp = PositionGetDouble(POSITION_TP);
        }
     }
  }

// Total commission + swap over ALL deals of a position (entry + exit), so
// brokers that charge commission on entry are captured, not just the close deal.
void SumPositionCharges(ulong positionId, double &commission, double &swap)
  {
   commission = 0; swap = 0;
   if(!HistorySelectByPosition(positionId)) return;
   int deals = HistoryDealsTotal();
   for(int i = 0; i < deals; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      commission += HistoryDealGetDouble(d, DEAL_COMMISSION);
      swap       += HistoryDealGetDouble(d, DEAL_SWAP);
     }
  }

//+------------------------------------------------------------------+
//| On close: send immediately (MFE pending) + queue for MFE finalize |
//+------------------------------------------------------------------+
void HandleClose(ulong positionId, ulong dealTicket)
  {
   int idx = FindTrack(positionId);

   double   exitPrice  = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double   profit     = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
   datetime closeTime  = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   string   symbol     = HistoryDealGetString(dealTicket, DEAL_SYMBOL);

   string   direction; double entry, sl, tp, volume; datetime openTime;
   if(idx >= 0)
     {
      direction = (g_pos[idx].type == POSITION_TYPE_BUY) ? "buy" : "sell";
      entry  = g_pos[idx].entry; sl = g_pos[idx].sl; tp = g_pos[idx].tp;
      volume = g_pos[idx].volume; openTime = g_pos[idx].openTime;
     }
   else
     {
      long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      direction = (dealType == DEAL_TYPE_SELL) ? "buy" : "sell";
      entry = exitPrice; sl = 0; tp = 0; openTime = closeTime;
      volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
     }

   // Commission is often booked on the ENTRY deal (GFT does), so the closing
   // deal alone reports 0 — sum commission + swap across ALL of the position's
   // deals. (Must read the out-deal fields above FIRST: this reselects history.)
   double commission = 0, swap = 0;
   SumPositionCharges(positionId, commission, swap);

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   // Immediate send: SL Size + Fixed R now, MFE pending (omitted).
   string json = BuildJson(positionId, symbol, direction, openTime, closeTime,
                           entry, sl, tp, exitPrice, volume,
                           commission + swap, profit + swap + commission, -1.0, digits);
   if(!SendJson(json)) QueuePayload(json);
   MarkSent(positionId);

   AddMfeWatch(positionId, symbol, direction, openTime, closeTime,
               entry, sl, tp, exitPrice, volume, commission + swap,
               profit + swap + commission, digits);

   if(idx >= 0) RemoveTrack(idx);
  }

//+------------------------------------------------------------------+
//| MFE finalization                                                 |
//+------------------------------------------------------------------+
void AddMfeWatch(ulong ticket, string symbol, string direction,
                 datetime openTime, datetime closeTime,
                 double entry, double sl, double tp, double exit,
                 double volume, double commission, double pnl, int digits)
  {
   int n = ArraySize(g_mfe);
   ArrayResize(g_mfe, n + 1);
   g_mfe[n].ticket = ticket; g_mfe[n].symbol = symbol; g_mfe[n].direction = direction;
   g_mfe[n].openTime = openTime; g_mfe[n].closeTime = closeTime;
   g_mfe[n].entry = entry; g_mfe[n].sl = sl; g_mfe[n].tp = tp; g_mfe[n].exit = exit;
   g_mfe[n].volume = volume; g_mfe[n].commission = commission; g_mfe[n].pnl = pnl;
   g_mfe[n].digits = digits;
   SymbolSelect(symbol, true);
   SaveMfeWatch();
  }

// Walk M1 bars over the trade's life [openTime, closeTime]; MFE = the peak
// favorable excursion from entry (buy: max high - entry; sell: entry - min low),
// floored at 0. The whole window is in the past once the trade closes, so this
// finalizes on the first successful read; the cap is only a fallback for when M1
// history never loads locally.
bool ComputeMfeFullLife(const MfeWatch &w, double &mfePrice)
  {
   MqlRates rates[];
   int n = CopyRates(w.symbol, PERIOD_M1, w.openTime, w.closeTime, rates);
   bool capReached = (TimeCurrent() - w.closeTime >= (datetime)InpMfeMaxHours * 3600);
   if(n <= 0)
     { if(capReached) { mfePrice = 0; return true; } return false; }

   bool   isBuy = (w.direction == "buy");
   double best  = w.entry;
   for(int i = 0; i < n; i++)
     {
      if(rates[i].time < w.openTime) continue;
      if(rates[i].time > w.closeTime) break;
      if(isBuy) { if(rates[i].high > best) best = rates[i].high; }
      else      { if(rates[i].low  < best) best = rates[i].low;  }
     }

   mfePrice = isBuy ? (best - w.entry) : (w.entry - best);
   if(mfePrice < 0) mfePrice = 0;
   return true;
  }

void FinalizePendingMfe()
  {
   bool changed = false;
   for(int i = ArraySize(g_mfe) - 1; i >= 0; i--)
     {
      double mfePrice = 0;
      if(!ComputeMfeFullLife(g_mfe[i], mfePrice))
         continue; // not ready yet

      string json = BuildJson(g_mfe[i].ticket, g_mfe[i].symbol, g_mfe[i].direction,
                              g_mfe[i].openTime, g_mfe[i].closeTime,
                              g_mfe[i].entry, g_mfe[i].sl, g_mfe[i].tp, g_mfe[i].exit,
                              g_mfe[i].volume, g_mfe[i].commission, g_mfe[i].pnl,
                              mfePrice, g_mfe[i].digits);
      if(SendJson(json))
        {
         PrintFormat("MFE finalized for #%I64u: %s price units.", g_mfe[i].ticket, DoubleToString(mfePrice, g_mfe[i].digits));
         // remove from watch
         int last = ArraySize(g_mfe) - 1;
         g_mfe[i] = g_mfe[last];
         ArrayResize(g_mfe, last);
         changed = true;
        }
      else QueuePayload(json); // network down; keep watch, retry later
     }
   if(changed) SaveMfeWatch();
  }

void SaveMfeWatch()
  {
   FileDelete(g_mfeFile);
   if(ArraySize(g_mfe) == 0) return;
   int h = FileOpen(g_mfeFile, FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   for(int i = 0; i < ArraySize(g_mfe); i++)
     {
      string line = (string)g_mfe[i].ticket + ";" + g_mfe[i].symbol + ";" + g_mfe[i].direction + ";" +
                    (string)(long)g_mfe[i].openTime + ";" + (string)(long)g_mfe[i].closeTime + ";" +
                    DoubleToString(g_mfe[i].entry, 8) + ";" + DoubleToString(g_mfe[i].sl, 8) + ";" +
                    DoubleToString(g_mfe[i].tp, 8) + ";" + DoubleToString(g_mfe[i].exit, 8) + ";" +
                    DoubleToString(g_mfe[i].volume, 2) + ";" + DoubleToString(g_mfe[i].commission, 2) + ";" +
                    DoubleToString(g_mfe[i].pnl, 2) + ";" + (string)g_mfe[i].digits;
      FileWriteString(h, line + "\n");
     }
   FileClose(h);
  }

void LoadMfeWatch()
  {
   ArrayResize(g_mfe, 0);
   if(!FileIsExist(g_mfeFile)) return;
   int h = FileOpen(g_mfeFile, FILE_READ|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      if(StringLen(line) == 0) continue;
      string p[];
      if(StringSplit(line, ';', p) < 13) continue;
      int n = ArraySize(g_mfe);
      ArrayResize(g_mfe, n + 1);
      g_mfe[n].ticket    = (ulong)StringToInteger(p[0]);
      g_mfe[n].symbol    = p[1];
      g_mfe[n].direction = p[2];
      g_mfe[n].openTime  = (datetime)StringToInteger(p[3]);
      g_mfe[n].closeTime = (datetime)StringToInteger(p[4]);
      g_mfe[n].entry     = StringToDouble(p[5]);
      g_mfe[n].sl        = StringToDouble(p[6]);
      g_mfe[n].tp        = StringToDouble(p[7]);
      g_mfe[n].exit      = StringToDouble(p[8]);
      g_mfe[n].volume    = StringToDouble(p[9]);
      g_mfe[n].commission= StringToDouble(p[10]);
      g_mfe[n].pnl       = StringToDouble(p[11]);
      g_mfe[n].digits    = (int)StringToInteger(p[12]);
      SymbolSelect(g_mfe[n].symbol, true);
     }
   FileClose(h);
  }

//+------------------------------------------------------------------+
//| JSON + HTTP                                                      |
//+------------------------------------------------------------------+
string D(double v, int digits) { return DoubleToString(v, digits); }

string BuildJson(ulong ticket, string symbol, string direction,
                 datetime openT, datetime closeT,
                 double entry, double sl, double tp, double exit,
                 double volume, double commission, double pnl,
                 double mfePrice, int digits)
  {
   string slField = (sl > 0) ? D(sl, digits) : "null";
   string tpField = (tp > 0) ? D(tp, digits) : "null";
   string json = "{";
   json += "\"mt5_ticket\":"  + (string)ticket + ",";
   json += "\"account_id\":"  + (string)AccountInfoInteger(ACCOUNT_LOGIN) + ",";
   json += "\"symbol\":\""     + symbol + "\",";
   json += "\"direction\":\""  + direction + "\",";
   json += "\"open_time\":\""  + ToIso(openT) + "\",";
   json += "\"close_time\":\"" + ToIso(closeT) + "\",";
   json += "\"entry_price\":"  + D(entry, digits) + ",";
   json += "\"sl_price\":"     + slField + ",";
   json += "\"tp_price\":"     + tpField + ",";
   json += "\"exit_price\":"   + D(exit, digits) + ",";
   json += "\"volume\":"       + DoubleToString(volume, 2) + ",";
   json += "\"commission\":"   + DoubleToString(commission, 2) + ",";
   json += "\"pnl_money\":"    + DoubleToString(pnl, 2) + ",";
   json += "\"account_balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   json += "\"account_equity\":"  + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   json += "\"account_currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\"";
   if(mfePrice >= 0)
      json += ",\"mfe_price\":" + D(mfePrice, digits);
   json += "}";
   return json;
  }

string ToIso(datetime serverTime)
  {
   datetime utc = serverTime - g_gmtOffsetSec;
   MqlDateTime dt; TimeToStruct(utc, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
  }

bool PostJson(string url, string json)
  {
   char post[], result[]; string resultHeaders;
   string headers = "Content-Type: application/json\r\nX-Ingest-Token: " + InpIngestToken + "\r\n";
   int len = StringToCharArray(json, post, 0, StringLen(json), CP_UTF8);
   ArrayResize(post, len);
   ResetLastError();
   int status = WebRequest("POST", url, headers, 5000, post, result, resultHeaders);
   if(status == -1)
     { PrintFormat("WebRequest failed err=%d (is the URL whitelisted in Options?)", GetLastError()); return false; }
   if(status < 200 || status >= 300)
     { PrintFormat("Ingest returned HTTP %d: %s", status, CharArrayToString(result)); return false; }
   return true;
  }

bool SendJson(string json)       { return PostJson(InpBackendUrl, json); }
bool SendPayoutJson(string json) { return PostJson(g_payoutUrl, json); }

//+------------------------------------------------------------------+
//| Trade-replay candles (served from the terminal's own history)    |
//+------------------------------------------------------------------+
// The backend queues a request for the M1 window around each closed trade
// (context padding before entry / after exit). We poll for pending requests
// (plain text, one per line: id;symbol;from_epoch;to_epoch in UTC seconds),
// CopyRates the window, and POST the bars back in chunks; the final chunk
// marks the request done. The server hands a window out only once it is fully
// in the past, and upserts are idempotent, so re-serving is harmless.
void ServeCandleRequests()
  {
   string url = g_candleReqUrl + "?account_id=" + (string)AccountInfoInteger(ACCOUNT_LOGIN);
   char data[], result[]; string resultHeaders;
   string headers = "X-Ingest-Token: " + InpIngestToken + "\r\n";
   ResetLastError();
   int status = WebRequest("GET", url, headers, 5000, data, result, resultHeaders);
   if(status < 200 || status >= 300) return; // silent: this poll runs every InpRetrySecs
   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   string lines[];
   int n = StringSplit(body, '\n', lines);
   for(int i = 0; i < n; i++)
     {
      string p[];
      if(StringSplit(lines[i], ';', p) < 4) continue;
      ServeOneCandleRequest(StringToInteger(p[0]), p[1],
                            (datetime)StringToInteger(p[2]), (datetime)StringToInteger(p[3]));
     }
  }

bool ServeOneCandleRequest(long reqId, string symbol, datetime fromUtc, datetime toUtc)
  {
   // CopyRates speaks broker/server time; the request window arrives in UTC.
   datetime fromSrv = fromUtc + g_gmtOffsetSec;
   datetime toSrv   = toUtc + g_gmtOffsetSec;
   if(TimeCurrent() < toSrv) return false; // window not fully in the past yet
   SymbolSelect(symbol, true);
   MqlRates rates[];
   int n = CopyRates(symbol, PERIOD_M1, fromSrv, toSrv, rates);
   if(n <= 0) return false; // history not loaded yet; retried next poll (server caps attempts)

   int  digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   long login  = AccountInfoInteger(ACCOUNT_LOGIN);
   int  sent   = 0;
   while(sent < n)
     {
      int  chunk  = MathMin(InpCandleChunk, n - sent);
      bool isLast = (sent + chunk >= n);
      string json = "{";
      json += "\"request_id\":" + (string)reqId + ",";
      json += "\"account_id\":" + (string)login + ",";
      json += "\"symbol\":\"" + symbol + "\",";
      json += "\"final\":" + (isLast ? "true" : "false") + ",";
      json += "\"candles\":[";
      for(int i = 0; i < chunk; i++)
        {
         MqlRates r = rates[sent + i];
         if(i > 0) json += ",";
         json += "[" + (string)(long)(r.time - g_gmtOffsetSec) + "," +
                 D(r.open, digits) + "," + D(r.high, digits) + "," +
                 D(r.low, digits) + "," + D(r.close, digits) + "]";
        }
      json += "]}";
      // Abort on failure and leave the request pending — the next poll
      // re-serves the whole window (idempotent upserts make resends harmless).
      if(!PostJson(g_candleUrl, json)) return false;
      sent += chunk;
     }
   PrintFormat("Candles served: %s %d bar(s) for request #%I64d", symbol, n, reqId);
   return true;
  }

//+------------------------------------------------------------------+
//| Payouts (balance-operation withdrawals)                          |
//+------------------------------------------------------------------+
string JsonEsc(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
  }

string BuildPayoutJson(ulong dealTicket, datetime t, double gross, string comment)
  {
   string json = "{";
   json += "\"account_id\":"  + (string)AccountInfoInteger(ACCOUNT_LOGIN) + ",";
   json += "\"deal_ticket\":" + (string)dealTicket + ",";
   json += "\"time\":\""       + ToIso(t) + "\",";
   json += "\"amount\":"       + DoubleToString(gross, 2) + ",";
   json += "\"comment\":\""     + JsonEsc(comment) + "\"";
   json += "}";
   return json;
  }

// A DEAL_TYPE_BALANCE deal with a negative amount = a profit withdrawal (payout).
// Positive amounts (deposits/credits) are ignored. Deduped locally by deal ticket
// (and again on the backend by ext_ref), so re-scans/backfills are no-ops.
void ProcessPayoutDeal(ulong dealTicket)
  {
   if(IsPayoutSent(dealTicket)) return;
   double amount = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
   if(amount >= 0.0) return; // deposit / positive balance op — not a payout
   string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
   // Only true withdrawals/payouts (comment contains "withdraw"); skip other
   // negative balance ops like fees/corrections. GFT payouts read "Withdraw+balance".
   string lc = comment; StringToLower(lc);
   if(StringFind(lc, "withdraw") < 0) return;
   datetime t = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   string json = BuildPayoutJson(dealTicket, t, -amount, comment);
   if(!SendPayoutJson(json)) QueuePayoutPayload(json);
   MarkPayoutSent(dealTicket);
   PrintFormat("Payout detected: deal #%I64u gross %.2f (%s)", dealTicket, -amount, comment);
  }

// One-time-per-run sweep of the FULL account history for balance operations, so
// withdrawals made before the EA was (re)attached still get imported. Cheap
// (balance ops are rare) and idempotent — ProcessPayoutDeal dedups by ticket
// locally, and the backend dedups again by (account_id, deal_ticket).
void ScanPayoutHistory()
  {
   if(!HistorySelect(0, TimeCurrent())) return;
   int total = HistoryDealsTotal(), found = 0;
   for(int i = 0; i < total; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(d, DEAL_TYPE) == DEAL_TYPE_BALANCE)
        { ProcessPayoutDeal(d); found++; }
     }
   if(found > 0) PrintFormat("Payout history scan: checked %d balance operation(s).", found);
  }

bool IsPayoutSent(ulong deal)
  {
   for(int i = 0; i < ArraySize(g_payoutSent); i++)
      if(g_payoutSent[i] == deal) return true;
   return false;
  }

void MarkPayoutSent(ulong deal)
  {
   if(IsPayoutSent(deal)) return;
   int n = ArraySize(g_payoutSent); ArrayResize(g_payoutSent, n + 1); g_payoutSent[n] = deal;
   int h = FileOpen(g_payoutSentFile, FILE_READ|FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(h != INVALID_HANDLE) { FileSeek(h, 0, SEEK_END); FileWriteString(h, (string)deal + "\n"); FileClose(h); }
  }

void LoadPayoutSent()
  {
   ArrayResize(g_payoutSent, 0);
   if(!FileIsExist(g_payoutSentFile)) return;
   int h = FileOpen(g_payoutSentFile, FILE_READ|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      if(StringLen(line) == 0) continue;
      int n = ArraySize(g_payoutSent); ArrayResize(g_payoutSent, n + 1); g_payoutSent[n] = (ulong)StringToInteger(line);
     }
   FileClose(h);
  }

void QueuePayoutPayload(string json)
  {
   int h = FileOpen(g_payoutQueueFile, FILE_READ|FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) { Print("Could not open payout queue; NOT persisted: ", json); return; }
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, json + "\n");
   FileClose(h);
  }

void FlushPayoutQueue()
  {
   if(!FileIsExist(g_payoutQueueFile)) return;
   int h = FileOpen(g_payoutQueueFile, FILE_READ|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   string remaining[]; int kept = 0;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      if(StringLen(line) == 0) continue;
      if(!SendPayoutJson(line)) { ArrayResize(remaining, kept + 1); remaining[kept++] = line; }
     }
   FileClose(h);
   FileDelete(g_payoutQueueFile);
   if(kept > 0)
     {
      int w = FileOpen(g_payoutQueueFile, FILE_WRITE|FILE_TXT|FILE_ANSI);
      if(w != INVALID_HANDLE)
        { for(int i = 0; i < kept; i++) FileWriteString(w, remaining[i] + "\n"); FileClose(w); }
      PrintFormat("Payout retry queue: %d still pending.", kept);
     }
  }

void QueuePayload(string json)
  {
   int h = FileOpen(g_queueFile, FILE_READ|FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) { Print("Could not open queue file; NOT persisted: ", json); return; }
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, json + "\n");
   FileClose(h);
  }

void FlushQueue()
  {
   if(!FileIsExist(g_queueFile)) return;
   int h = FileOpen(g_queueFile, FILE_READ|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   string remaining[]; int kept = 0;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      if(StringLen(line) == 0) continue;
      if(!SendJson(line)) { ArrayResize(remaining, kept + 1); remaining[kept++] = line; }
     }
   FileClose(h);
   FileDelete(g_queueFile);
   if(kept > 0)
     {
      int w = FileOpen(g_queueFile, FILE_WRITE|FILE_TXT|FILE_ANSI);
      if(w != INVALID_HANDLE)
        { for(int i = 0; i < kept; i++) FileWriteString(w, remaining[i] + "\n"); FileClose(w); }
      PrintFormat("Retry queue: %d still pending.", kept);
     }
  }

//+------------------------------------------------------------------+
//| Sent bookkeeping                                                 |
//+------------------------------------------------------------------+
bool IsSent(ulong positionId)
  {
   for(int i = 0; i < ArraySize(g_sent); i++)
      if(g_sent[i] == positionId) return true;
   return false;
  }

void MarkSent(ulong positionId)
  {
   if(IsSent(positionId)) return;
   int n = ArraySize(g_sent); ArrayResize(g_sent, n + 1); g_sent[n] = positionId;
   int h = FileOpen(g_sentFile, FILE_READ|FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(h != INVALID_HANDLE) { FileSeek(h, 0, SEEK_END); FileWriteString(h, (string)positionId + "\n"); FileClose(h); }
  }

void LoadSent()
  {
   ArrayResize(g_sent, 0);
   if(!FileIsExist(g_sentFile)) return;
   int h = FileOpen(g_sentFile, FILE_READ|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      if(StringLen(line) == 0) continue;
      int n = ArraySize(g_sent); ArrayResize(g_sent, n + 1); g_sent[n] = (ulong)StringToInteger(line);
     }
   FileClose(h);
   PrintFormat("Loaded %d previously-sent trade id(s).", ArraySize(g_sent));
  }

//+------------------------------------------------------------------+
//| Backfill (off by default; only catches closes missed offline)    |
//+------------------------------------------------------------------+
void BackfillHistory()
  {
   datetime from = TimeCurrent() - (datetime)InpBackfillDays * 24 * 3600;
   if(!HistorySelect(from, TimeCurrent())) return;
   ulong pending[]; int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      // Catch withdrawals (balance operations) missed while the EA was offline.
      if(HistoryDealGetInteger(deal, DEAL_TYPE) == DEAL_TYPE_BALANCE)
        { ProcessPayoutDeal(deal); continue; }
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;
      ulong posId = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      if(posId == 0 || IsSent(posId) || FindTrack(posId) >= 0) continue;
      bool dup = false;
      for(int j = 0; j < ArraySize(pending); j++) if(pending[j] == posId) { dup = true; break; }
      if(!dup) { int n = ArraySize(pending); ArrayResize(pending, n + 1); pending[n] = posId; }
     }
   int done = 0;
   for(int i = 0; i < ArraySize(pending); i++) if(ProcessHistoricalClose(pending[i])) done++;
   if(ArraySize(pending) > 0) PrintFormat("Backfill: sent %d/%d missed close(s).", done, ArraySize(pending));
  }

bool ProcessHistoricalClose(ulong positionId)
  {
   if(!HistorySelectByPosition(positionId)) return false;
   double entry = 0, exit = 0, volume = 0, profit = 0, commission = 0, swap = 0, sl = 0, tp = 0;
   datetime openTime = 0, closeTime = 0;
   string symbol = "", direction = "buy";
   int deals = HistoryDealsTotal();
   for(int i = 0; i < deals; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      long  e = HistoryDealGetInteger(d, DEAL_ENTRY);
      // Commission/swap can sit on EITHER deal — accumulate for every deal.
      commission += HistoryDealGetDouble(d, DEAL_COMMISSION);
      swap       += HistoryDealGetDouble(d, DEAL_SWAP);
      if(e == DEAL_ENTRY_IN)
        {
         entry = HistoryDealGetDouble(d, DEAL_PRICE);
         openTime = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
         volume = HistoryDealGetDouble(d, DEAL_VOLUME);
         symbol = HistoryDealGetString(d, DEAL_SYMBOL);
         direction = (HistoryDealGetInteger(d, DEAL_TYPE) == DEAL_TYPE_BUY) ? "buy" : "sell";
        }
      else if(e == DEAL_ENTRY_OUT || e == DEAL_ENTRY_OUT_BY)
        {
         exit = HistoryDealGetDouble(d, DEAL_PRICE);
         closeTime = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
         profit += HistoryDealGetDouble(d, DEAL_PROFIT);
         if(symbol == "") symbol = HistoryDealGetString(d, DEAL_SYMBOL);
        }
     }
   int orders = HistoryOrdersTotal();
   for(int i = 0; i < orders; i++)
     {
      ulong o = HistoryOrderGetTicket(i);
      double osl = HistoryOrderGetDouble(o, ORDER_SL);
      double otp = HistoryOrderGetDouble(o, ORDER_TP);
      if(osl > 0 && sl == 0) sl = osl;
      if(otp > 0 && tp == 0) tp = otp;
     }
   if(symbol == "" || entry == 0 || exit == 0) return false;
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   string json = BuildJson(positionId, symbol, direction, openTime, closeTime,
                           entry, sl, tp, exit, volume, commission + swap,
                           profit + swap + commission, -1.0, digits);
   if(!SendJson(json)) QueuePayload(json);
   MarkSent(positionId);
   // also compute MFE from history for backfilled trades
   AddMfeWatch(positionId, symbol, direction, openTime, closeTime,
               entry, sl, tp, exit, volume, commission + swap,
               profit + swap + commission, digits);
   return true;
  }
//+------------------------------------------------------------------+
