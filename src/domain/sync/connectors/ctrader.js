// The cTrader connector's PURE half: turning a cTrader deal into the ingest
// payload the EA and the MT5 farm already post. No sockets, no database, no
// crypto.
//
// Split this way on purpose. The socket half cannot be exercised without a
// Spotware client id and a real broker account, so anything living there is
// untestable until both exist. Everything that can be wrong in a way the UI would
// not reveal lives HERE instead, where node:test can pin it today.
//
// ------------------------------------------------------------------ THE 100x TRAP
// Every monetary int64 in the Open API scales by *that message's own* moneyDigits
// field. Not a constant. Not inherited from a sibling message. Volume is in
// "cents" of units and lotSize is ALSO in cents.
//
// Get either wrong and every R value in the journal is silently wrong while
// looking entirely plausible -- no exception, no empty chart, just believable bad
// numbers that a trader would act on. This is the cTrader equivalent of the MT5
// farm's four landmines, and unlike those it can be caught before a live account
// exists, which is why it is tested first.
//
// -------------------------------------------------- ONE ROW PER *CLOSING DEAL*
// Keyed on dealId, not positionId. A partial close emits several closing deals
// against one positionId; keying on positionId would make each one rewrite the
// last, showing one trade where the trader took three. dealId also gives push and
// reconciliation a shared natural key, which is what makes re-reading an
// overlapping window free -- and that is what lets the backfill cursor re-ask
// from its last timestamp instead of doing a +1ms bump that can skip two deals
// sharing a millisecond.

import { toBandedLogin, fromBandedLogin } from '../logins.js';

/**
 * Scale a cTrader int64 by its own message's moneyDigits.
 *
 * Defaults to 2, never to 0. Zero would report cents as whole units -- a silent
 * 100x overstatement of every P&L figure, which is exactly the failure this
 * module exists to make impossible.
 */
export const scaleMoney = (raw, moneyDigits) =>
  Number(raw ?? 0) / 10 ** Number(moneyDigits ?? 2);

/**
 * Lots from two cents-denominated quantities. Both volume and lotSize are in
 * cents, so the hundredths cancel and no factor of 100 belongs here -- writing
 * one in is the most tempting way to get this wrong.
 */
export const toLots = (volumeInCents, lotSizeInCents) => {
  const lot = Number(lotSizeInCents);
  if (!lot) return null;
  return Number(volumeInCents) / lot;
};

/** Only a deal that closed something carries realized P&L worth journalling. */
export const isClosingDeal = (deal) => Boolean(deal?.closePositionDetail);

/** cTrader writes symbols as 'EUR/USD'; the journal and pip math use 'EURUSD'. */
export const normalizeCtraderSymbol = (name) => String(name ?? '').replace(/\//g, '');

const iso = (ms) => new Date(Number(ms)).toISOString();

/**
 * The account's own facts, from ProtoOATrader plus the broker's asset list.
 *
 * WHY THIS IS NEEDED AT ALL. `ProtoOAGetAccountListByAccessTokenRes` -- the only thing
 * discovery can call -- does not carry the deposit currency, so every cTrader account
 * was provisioned with the `'USD'` fallback in routes/ctrader.js. On prod that put USD
 * on a EUR demo account, which is the same class of error as the balance mismatch it
 * sits next to: a number rendered in a unit it is not in.
 *
 * ProtoOATrader carries `depositAssetId`, an id that means nothing on its own --
 * ProtoOAAssetListReq is what turns it into "EUR". Both are already reachable from the
 * sync job: fetchTrader() is called on every run for registrationTimestamp and its
 * `balance` and `moneyDigits` were being thrown away.
 *
 * THE BALANCE COMES BACK TOO, AND IT IS NOT REDUNDANT. `dealToTrade` already reports a
 * post-close balance, but ONLY on a closing deal -- an account with no closed trades has
 * no `accounts` row at all, so the app knows nothing about what it holds. On prod that
 * is account 33: connected, synced, and invisible to the reconciliation check. This
 * figure arrives whether or not the account has ever traded.
 *
 * MONEY DIGITS ARE THE MESSAGE'S OWN, as everywhere else in this file. ProtoOATrader
 * declares its own `moneyDigits` and it is NOT the one on a deal's closePositionDetail.
 *
 * Returns null when there is nothing worth writing, so a caller can pass the result on
 * without deciding what an absent field means.
 */
export function traderAccountFacts(trader, assets = []) {
  if (!trader) return null;
  const balance = trader.balance == null
    ? null
    : scaleMoney(trader.balance, trader.moneyDigits);
  const depositAssetId = trader.depositAssetId == null ? null : Number(trader.depositAssetId);
  const asset = depositAssetId == null
    ? null
    : (assets ?? []).find((a) => Number(a?.assetId) === depositAssetId) ?? null;
  // `name` is the code ('EUR'); displayName is prose ('Euro') and would land a sentence
  // in a currency column.
  const currency = asset?.name ? String(asset.name).trim().toUpperCase().slice(0, 8) : null;
  if (balance == null && currency == null) return null;
  return { balance, currency };
}

export const ctraderConnector = {
  id: 'ctrader',
  scaleMoney,
  toLots,
  isClosingDeal,
  normalizeCtraderSymbol,
  traderAccountFacts,

  /**
   * A closing deal plus its opening deal becomes one ingest payload.
   *
   * DIRECTION COMES FROM THE OPENING DEAL. The closing deal's tradeSide is the
   * opposite of the trade the trader actually took -- a long is closed by a sell
   * -- so reading it here would invert every direction in the journal, and the
   * win rate would still look fine.
   */
  dealToTrade({ deal, openDeal, symbolName, lotSize, bandedLogin }) {
    const d = deal.closePositionDetail;
    const money = (v) => scaleMoney(v, d.moneyDigits);
    const openSide = String(openDeal?.tradeSide ?? '').toUpperCase();
    return {
      mt5_ticket: Number(deal.dealId),
      account_id: Number(bandedLogin),
      symbol: normalizeCtraderSymbol(symbolName),
      direction: openSide === 'SELL' ? 'sell' : 'buy',
      // Falls back to the closing timestamp when the opening deal is outside the
      // fetched window -- a trade with a wrong open time is recoverable, a trade
      // silently dropped from the journal is not.
      open_time: iso(openDeal?.executionTimestamp ?? deal.executionTimestamp),
      close_time: iso(deal.executionTimestamp),
      entry_price: Number(d.entryPrice),
      exit_price: Number(deal.executionPrice),
      volume: toLots(d.closedVolume, lotSize),
      commission: money(d.commission),
      // Net, matching what the MT5 EA reports: the trader's account moved by this.
      pnl_money:
        money(d.grossProfit) + money(d.swap) + money(d.commission) + money(d.pnlConversionFee),
      // Free equity-curve anchor: cTrader hands us the post-close balance on every
      // closing deal, so no extra request is needed to plot the account.
      account_balance: money(d.balance),
    };
  },
};

export { toBandedLogin, fromBandedLogin };
