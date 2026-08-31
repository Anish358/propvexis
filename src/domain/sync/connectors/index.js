// Connector resolution. THIS registry is what makes "extensible" a fact rather
// than an intention: adding TradeLocker (P2) or cTrader (P3) is a module here
// plus a catalog entry in platforms.js, and nothing else in the account or
// provisioning path moves.
//
// It is deliberately NOT paired with a generalized credential table. Designing one
// before knowing what a cTrader token pair and a TradeLocker JWT actually need in
// practice is how you get a JSONB column that fits neither — and every one of the
// MT5 farm's four landmines was found against a live account, not in a document.
// Credentials are sealed under an account-bound AAD, so they can move tables later
// with no re-encryption.
import { findPlatform } from '../platforms.js';
import { mt5Connector } from './mt5.js';
import { tradelockerConnector } from './tradelocker/index.js';

/**
 * Every connector MODULE that exists. Exported so a worker can resolve one by
 * name and so the wiring is testable, but note what it is NOT: presence here does
 * not turn Auto Sync on. TradeLocker sits in this map with its platform entry
 * still `connector: null`, because the module is finished and the platform is not
 * -- spec §13.2 says derived P&L may not reconcile against /state, and that is
 * only learnable against a live account.
 */
export const CONNECTORS = Object.freeze({
  mt5: mt5Connector,
  tradelocker: tradelockerConnector,
});

/**
 * The connector for a platform id, or null when that platform cannot Auto Sync.
 *
 * Resolution goes THROUGH the platform registry rather than straight to REGISTRY,
 * so `connector: null` in platforms.js is the single switch that turns Auto Sync
 * off for a platform. A direct key lookup would let the two disagree.
 */
export function getConnector(platformId) {
  const platform = findPlatform(platformId);
  if (!platform?.connector) return null;
  return CONNECTORS[platform.connector] ?? null;
}
