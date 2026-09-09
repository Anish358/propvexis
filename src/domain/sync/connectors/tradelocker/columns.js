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
 *
 * `tradableInstrumentId` is here though pairing.js itself never reads it --
 * pairOrders is called once PER instrument, and it is the WORKER's backfill
 * that groups a window's rows by this field before pairing ever runs (Task 7,
 * worker/tradelocker/backfill.js). Grouping wrong pairs one instrument's fill
 * against another's, so this is exactly as load-bearing as the eight fields
 * pairing.js reads directly, and belongs on the same fail-fast list.
 *
 * `commission` is deliberately NOT here. Confirmed against a real TradeLocker
 * demo account (server "FTLOCK") by fetching its actual /trade/config: a
 * commission-free / spread-only broker's ordersHistoryConfig never carries a
 * `commission` column at all -- not blank, ABSENT. Requiring it made Auto Sync
 * unable to onboard that broker, or presumably any other with the same pricing
 * model. pairing.js checks for it with resolver.has('commission') at read time
 * instead, and treats a wholly absent column as a real, documented zero -- see
 * the comment on that check for why that is different from a blank row value.
 */
export const ORDERS_HISTORY_FIELDS = Object.freeze([
  'id', 'positionId', 'side', 'status', 'filledQty', 'avgPrice',
  'createdDate', 'tradableInstrumentId',
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
