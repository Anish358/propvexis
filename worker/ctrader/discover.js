// Enumerating the trading accounts a cTID owns.
//
// This is the ONLY thing that can answer "which accounts does this grant cover",
// and it needs a protobuf socket -- which is why the web tier writes no job and
// simply waits for these rows to appear.

/** SCOPE_VIEW = 0, SCOPE_TRADE = 1 (ProtoOAClientPermissionScope). */
export const SCOPE_VIEW = 0;

/**
 * ProtoOAGetAccountListByAccessTokenReq.
 *
 * The account list is returned by either endpoint and describes accounts in BOTH
 * environments; `isLive` on each row is what says where each one actually lives.
 * So it is asked once and the rows are sorted onto their real sockets afterwards
 * (landmine 10.7).
 *
 * THE SCOPE IS CHECKED HERE, AGAINST THE SERVER'S OWN ANSWER. The OAuth module
 * has a policy test asserting we never REQUEST the trading scope, but that proves
 * only what we asked for. permissionScope is what Spotware actually granted, and
 * it is the first moment we can compare the two. A SCOPE_TRADE grant means this
 * app could place orders on a user's funded account -- we refuse it rather than
 * hold it, because the read-only promise for this platform IS the scope.
 */
export async function discoverAccounts({ conn, accessToken }) {
  const res = await conn.request('ProtoOAGetAccountListByAccessTokenReq', { accessToken });

  const scope = res?.permissionScope;
  if (scope != null && Number(scope) !== SCOPE_VIEW) {
    throw new Error(
      `ctrader: grant is SCOPE_TRADE, refusing it — PropVexis requests view-only access`,
    );
  }

  // CAMEL CASE, AND THAT IS A CONTRACT, NOT A STYLE CHOICE. These objects are
  // JSON-posted straight to /api/ctrader/discovery/:id and handed to
  // upsertDiscoveredQuery, which reads a.ctidTraderAccountId, a.traderLogin,
  // a.isLive, a.brokerName. Emitting snake_case here resolved every field to
  // undefined and put a null in the NOT NULL primary key -- discovery 500'd and
  // the picker was never populated. Two modules, one JSON shape, no type system
  // between them, so test/ctrader-discovery.test.js runs the real producer into
  // the real consumer.
  const accounts = (res?.ctidTraderAccount ?? []).map((a) => ({
    ctidTraderAccountId: Number(a.ctidTraderAccountId),
    traderLogin: a.traderLogin == null ? null : Number(a.traderLogin),
    // Which of the two disjoint sockets this account lives on. Stored, never
    // recomputed, and a real boolean: undefined would be neither socket.
    isLive: a.isLive === true,
    brokerName: a.brokerTitleShort ?? null,
    // Not in this response. ProtoOATraderReq carries the deposit asset when the
    // account is actually used; inventing a currency here would put a wrong one
    // on the picker card.
    depositCurrency: null,
    registeredAt: null,
  }));
  return { accounts };
}

/**
 * The cTID user id behind the grant.
 *
 * A SEPARATE REQUEST, because ProtoOAGetAccountListByAccessTokenRes does not
 * carry it -- it returns accessToken, permissionScope and the account list, and
 * nothing else. It matters because ctrader_identities has a unique index on
 * (user_id, ctid_user_id) for live rows: without this the same cTID can be
 * connected twice and the same accounts discovered under two identities.
 */
export async function fetchCtidUserId({ conn, accessToken }) {
  const res = await conn.request('ProtoOAGetCtidProfileByTokenReq', { accessToken });
  const id = res?.profile?.userId;
  return id == null ? null : Number(id);
}
