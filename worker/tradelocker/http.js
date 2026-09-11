// One request against TradeLocker's own REST API.
//
// Every other file in this connector (auth, discover, config, backfill,
// reconcile) is an outbound HTTP call to demo.tradelocker.com or
// live.tradelocker.com, and they all share the same three landmines: parse the
// {s, d} envelope, attach the bearer token and accNum header the same way every
// time, and throw with a status code a caller can branch on (Ruling B's
// demo-then-live probe reads `err.status === 401`). One helper, so those three
// things are right in one place instead of five.

const parse = async (res) => {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { status: res.status, ok: res.ok, body };
};

/**
 * @param {string} host   one of TRADELOCKER_HOSTS.{live,demo} — trailing slash included
 * @param {string} path   relative to the host, no leading slash (e.g. 'auth/jwt/token')
 */
export async function tlRequest(host, path, {
  method = 'GET', token, accNum, body, fetchImpl = fetch,
} = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  // accNum is a HEADER, not a query param -- every /trade/* route needs it, and
  // sending it as the wrong value returns ANOTHER of the same trader's accounts
  // with a 200 (design spec §5.1). We never guess it: callers pass exactly what
  // discovery returned.
  if (accNum != null) headers.accNum = String(accNum);

  const { status, ok, body: parsed } = await parse(
    await fetchImpl(`${host}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  if (!ok) {
    const err = new Error(`tradelocker: ${method} ${path} -> ${status}`);
    err.status = status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}
