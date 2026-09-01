// TradeLocker returns rows as POSITIONAL ARRAYS OF STRINGS. The meaning of each
// index is published at GET /trade/config, per section, and is TradeLocker's to
// change. Resolving by index is therefore not a shortcut, it is a latent
// corruption: a shifted column moves commission into price and every trade is
// wrong with no error anywhere -- the same class of bug as cTrader's moneyDigits,
// with a different mechanism.
//
// THIS MODULE IS THE ONLY PLACE ALLOWED TO KNOW AN INDEX EXISTS.

/** /trade/config publishes one `<section>Config` block per response shape. */
const SECTIONS = {
  ordersHistory: 'ordersHistoryConfig',
  orders: 'ordersConfig',
  positions: 'positionsConfig',
  filledOrders: 'filledOrdersConfig',
  accountDetails: 'accountDetailsConfig',
};

/**
 * Every ordersHistory field the trade reconstruction depends on.
 *
 * Named here rather than scattered through pairing.js so a config that has
 * stopped carrying one of them can be rejected at worker start -- once, loudly --
 * instead of throwing halfway through a backfill with some trades already posted.
 */
export const ORDERS_HISTORY_FIELDS = Object.freeze([
  'id', 'positionId', 'side', 'status', 'filledQty', 'avgPrice',
  'createdDate', 'commission',
]);

/**
 * A by-name accessor over one section's positional rows.
 *
 * `get` THROWS on an unknown name rather than returning undefined. A field we
 * cannot find is a schema change we must notice, not a null to carry quietly
 * into a trade's price.
 */
export function buildResolver(config, section) {
  const key = SECTIONS[section];
  if (!key) throw new Error(`tradelocker: unknown config section '${section}'`);
  const columns = config?.d?.[key]?.columns;
  if (!Array.isArray(columns) || !columns.length) {
    throw new Error(`tradelocker: /trade/config has no ${key}`);
  }
  const index = new Map(columns.map((c, i) => [c.id, i]));
  return {
    section,
    has: (name) => index.has(name),
    get(row, name) {
      if (!index.has(name)) throw new Error(`tradelocker: no '${name}' column in ${key}`);
      return row?.[index.get(name)];
    },
  };
}

/** Every field this section needs, or a throw naming the ones it does not have. */
export function assertFields(resolver, names) {
  const missing = names.filter((n) => !resolver.has(n));
  if (missing.length) {
    throw new Error(
      `tradelocker: /trade/config ${resolver.section} is missing ${missing.join(', ')}`,
    );
  }
  return resolver;
}

const blank = (v) => v == null || String(v).trim() === '';

/**
 * A number, or null.
 *
 * '' IS NULL, NOT ZERO. Number('') is 0, so the naive version posts a real trade
 * with a fabricated zero commission and nothing anywhere reads as an error.
 * Unparseable input is null for the same reason -- NaN carried into money
 * propagates into fixed_r and into every prop rule-breach decision.
 * A genuine '0' still parses to 0: only the ABSENT value becomes null.
 */
export const num = (v) => {
  if (blank(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** An integer, or null. Same '' rule as num. */
export const int = (v) => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

/** A trimmed string, or null. Same '' rule, so '' never becomes a stored empty. */
export const str = (v) => (blank(v) ? null : String(v).trim());
