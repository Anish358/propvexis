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

const REGISTRY = {
  mt5: mt5Connector,
};

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
  return REGISTRY[platform.connector] ?? null;
}
