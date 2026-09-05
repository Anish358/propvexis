import { config } from '../platform/config.js';
import {
  ctraderEnabled, signState, verifyState, grantUrl, exchangeCode,
} from '../domain/sync/ctraderOauth.js';
import {
  identitiesEnabled, sealTokens, createIdentity, rotateTokens,
  listIdentities, revokeIdentity, discoveredForIdentity,
  identitiesAwaitingDiscovery, freshAccessToken, upsertDiscovered, setCtid,
  supersedeDuplicateIdentities,
  markIdentityError, identityForUser,
} from '../domain/sync/ctraderIdentities.js';
import { workerTokenMatches } from '../domain/sync/workerAuth.js';
import {
  validateProvision, provisionAccount, provisionGate, PROVISION_CONFLICT,
} from '../domain/accounts/provision.js';
import { toBandedLogin } from '../domain/sync/logins.js';
import { planForUser, syncedAccountCount, manualAccountCount } from '../domain/billing/entitlements.js';

/**
 * cTrader Open API: the OAuth surface and the account picker's data.
 *
 * WHAT THIS MODULE DOES NOT DO. It never opens a protobuf socket. Listing a
 * cTID's trading accounts requires ProtoOAGetAccountListByAccessTokenReq on a
 * live connection, which is the worker's whole job; growing a second protobuf
 * client in the web tier would mean two implementations of application auth,
 * heartbeats and reconnect. The worker fills ctrader_discovered_accounts and
 * these routes read it.
 *
 * CONSEQUENCE, STATED PLAINLY: until the worker ships, a freshly connected
 * identity discovers nothing and GET .../accounts returns an empty list with
 * `pending: true`. That is the honest state, not an error.
 *
 * Registered by calling this function on the ROOT app instance rather than
 * through app.register(). A registered plugin gets its own encapsulated context,
 * and a route defined there cannot see decorators added to the parent afterwards
 * -- app.requireAuth would be undefined and the global rate-limit hook would not
 * apply.
 */
export default function ctraderRoutes(app) {
  // Refusing while unconfigured is the right failure, the same way the sync
  // routes refuse without SYNC_CRED_KEY: starting an OAuth flow we cannot
  // complete, or accepting tokens we cannot encrypt, is worse than not offering
  // the feature.
  const requireConfigured = (reply) => {
    if (!ctraderEnabled(config)) {
      reply.code(503).send({ error: 'cTrader is not configured (CTRADER_CLIENT_ID)' });
      return false;
    }
    if (!identitiesEnabled()) {
      reply.code(503).send({ error: 'cTrader is not configured (SYNC_CRED_KEY)' });
      return false;
    }
    return true;
  };

  /**
   * Begin a grant. Returns the URL rather than redirecting, so the SPA controls
   * the navigation and can keep its wizard state.
   */
  app.post('/api/ctrader/authorize', { preHandler: app.requireAuth }, async (req, reply) => {
    if (!requireConfigured(reply)) return reply;
    const state = signState(req.user.uid, config.sessionSecret);
    return reply.send({
      url: grantUrl({
        clientId: config.ctraderClientId,
        redirectUri: config.ctraderRedirectUri,
        state,
      }),
    });
  });

  /**
   * The consent redirect lands here.
   *
   * THE USER ID COMES FROM THE SIGNED STATE AND FROM NOWHERE ELSE. Reading it
   * from a query parameter would let anyone attach their own cTrader identity to
   * another person's PropVexis account, and every account that person then
   * imported would be the attacker's to watch.
   *
   * There is no session guard on this route because a cross-site redirect does
   * not reliably carry a SameSite cookie -- the signed state IS the guard, which
   * is exactly what it exists for.
   */
  app.get('/api/ctrader/callback', async (req, reply) => {
    if (!requireConfigured(reply)) return reply;

    const back = (params) =>
      reply.redirect(`/accounts/new?${new URLSearchParams(params).toString()}`);

    const proven = verifyState(req.query?.state, config.sessionSecret);
    if (!proven) return back({ ctrader: 'error', reason: 'expired' });
    const code = String(req.query?.code ?? '');
    if (!code) return back({ ctrader: 'error', reason: 'denied' });

    let tokens;
    try {
      // FIRST, before any database work. The authorization code expires after
      // SIXTY SECONDS, and a slow callback fails in a way that reads exactly like
      // a bad client secret.
      tokens = await exchangeCode({ code });
    } catch (err) {
      req.log.error({ err: err.message }, 'cTrader code exchange failed');
      return back({ ctrader: 'error', reason: 'exchange_failed' });
    }

    try {
      // The row first, because the ciphertext is bound to the id the database
      // assigns (identityAad). Sealing against a guessed id yields a row nothing
      // can ever open.
      const identity = await createIdentity(proven.userId, 'accounts', tokens.expiresAt);
      const sealed = sealTokens(identity.id, tokens);
      await rotateTokens(identity.id, sealed.access_token_ct, sealed.refresh_token_ct, tokens.expiresAt);
      return back({ ctrader: 'connected', identity: String(identity.id) });
    } catch (err) {
      req.log.error({ err: err.message }, 'cTrader identity store failed');
      return back({ ctrader: 'error', reason: 'store_failed' });
    }
  });

  /** The caller's live grants. Never returns ciphertext — the query cannot select it. */
  app.get('/api/ctrader/identities', { preHandler: app.requireAuth }, async (req, reply) => {
    return reply.send({
      configured: ctraderEnabled(config) && identitiesEnabled(),
      identities: await listIdentities(req.user.uid),
    });
  });

  /**
   * What the account picker renders.
   *
   * `pending` distinguishes "the worker has not looked yet" from "this cTID owns
   * no accounts". They are the same empty array and very different messages, and
   * showing the second when the first is true reads as a broken integration.
   */
  app.get('/api/ctrader/identities/:id/accounts', { preHandler: app.requireAuth }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid identity id' });
    const accounts = await discoveredForIdentity(req.user.uid, id);
    return reply.send({ accounts, pending: accounts.length === 0 });
  });

  // ---- worker-facing: discovery -----------------------------------------
  //
  // Discovery is NOT a sync_jobs row. Listing a cTID's accounts needs a protobuf
  // socket, so it is the worker's job -- but sync_jobs.account_id is NOT NULL and
  // references mt5_accounts, and at discovery time no account exists yet;
  // discovering them is the point. Rather than make that column nullable for
  // every other caller, the worker polls these two routes.

  const requireWorker = async (req, reply) => {
    if (!workerTokenMatches(req.headers.authorization, config.syncWorkerToken)) {
      return reply.code(401).send({ error: 'worker not authorized' });
    }
    return undefined;
  };

  /**
   * Identities still needing their accounts enumerated, each with a USABLE access
   * token. Refresh happens here, not in the worker: the refresh token is consumed
   * on use, so a rotation the worker completed but failed to report back would be
   * unrecoverable.
   */
  app.get('/api/ctrader/discovery/pending', { preHandler: requireWorker }, async (req, reply) => {
    if (!ctraderEnabled(config) || !identitiesEnabled()) return reply.send({ identities: [] });
    const rows = await identitiesAwaitingDiscovery(5);
    const identities = [];
    for (const row of rows) {
      try {
        const { accessToken } = await freshAccessToken({ ...row, identity_id: row.id });
        identities.push({ identity_id: Number(row.id), access_token: accessToken });
      } catch (err) {
        req.log.error({ identity: row.id, err: err.message }, 'ctrader discovery token unusable');
        await markIdentityError(row.id, err.message.slice(0, 1000));
      }
    }
    return reply.send({ identities });
  });

  /**
   * What the worker found. The cTID user id arrives with it because
   * ProtoOAGetAccountListByAccessTokenReq is the first call that reveals it.
   */
  app.post('/api/ctrader/discovery/:id', { preHandler: requireWorker }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid identity id' });
    const accounts = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
    if (req.body?.ctid_user_id != null) {
      const ctidUserId = Number(req.body.ctid_user_id);
      // BEFORE setCtid, never after: setting the cTID on this row while an older
      // row still holds it live raises 23505 on uq_ctrader_identities_live and
      // discovery fails permanently, for a reason nothing in the UI can explain.
      // Clicking "Authorize" twice is enough to cause it.
      const superseded = await supersedeDuplicateIdentities(id, ctidUserId);
      if (superseded.length) {
        req.log.info({ identity: id, superseded: superseded.map((r) => r.id) },
          'ctrader: retired older identities for the same cTID');
      }
      await setCtid(id, ctidUserId);
    }
    for (const a of accounts) await upsertDiscovered(id, a);
    return reply.send({ ok: true, stored: accounts.length });
  });

  /**
   * Provision the accounts the user picked.
   *
   * ONE PROPVEXIS ACCOUNT PER SELECTED cTRADER ACCOUNT, each with its own
   * provision_key so a double-submit replays instead of duplicating. The
   * selections are re-read from ctrader_discovered_accounts rather than trusted
   * from the body: a caller could otherwise name any ctidTraderAccountId and have
   * us provision an account pointing at a stranger's trading account.
   */
  app.post('/api/ctrader/identities/:id/accounts', { preHandler: app.requireAuth }, async (req, reply) => {
    if (!requireConfigured(reply)) return reply;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid identity id' });
    if (!await identityForUser(req.user.uid, id)) {
      return reply.code(404).send({ error: 'identity not found' });
    }

    const wanted = (Array.isArray(req.body?.selections) ? req.body.selections : []).map(Number);
    if (!wanted.length) return reply.code(400).send({ error: 'select at least one account' });

    // The authority on what this identity owns is the discovered table, not the body.
    const owned = await discoveredForIdentity(req.user.uid, id);
    const byCtid = new Map(owned.map((a) => [Number(a.ctid_trader_account_id), a]));
    const unknown = wanted.filter((c) => !byCtid.has(c));
    if (unknown.length) {
      return reply.code(400).send({ error: 'those accounts are not on this connection' });
    }

    // THE SAME GATE EVERY OTHER PROVISION PATH USES. Plan caps are lifted today
    // (every tier is Infinity), so this changes nothing now -- which is exactly
    // why it has to be wired in NOW rather than remembered later: the day caps
    // return, a route that skipped the gate is a free unlimited-accounts hole,
    // and nothing would fail to point at it.
    const plan = await planForUser(req.user.uid);
    const gate = provisionGate({
      plan,
      kind: 'synced',
      // The gate asks "may ONE more be created", so a batch of N is checked by
      // pretending N-1 already exist. Checking only the current count would let a
      // capped user pick five accounts and get all five.
      syncedCount: (await syncedAccountCount(req.user.uid)) + wanted.length - 1,
      manualCount: await manualAccountCount(req.user.uid),
    });
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });

    const created = [];
    for (const ctid of wanted) {
      const found = byCtid.get(ctid);
      const parsed = validateProvision({
        ...req.body,
        platform: 'ctrader',
        import_method: 'auto_sync',
        kind: 'synced',
        credential: undefined,
        // Distinct per selection, so picking three accounts is three accounts and
        // a retried submit replays rather than duplicating.
        provision_key: `${String(req.body?.provision_key ?? `ct-${id}`)}:${ctid}`,
        label: String(req.body?.label ?? '').trim() || `cTrader ${found.trader_login ?? ctid}`,
        broker: req.body?.broker ?? found.broker_name ?? null,
        currency: req.body?.currency ?? found.deposit_currency ?? 'USD',
      });
      if (!parsed.ok) return reply.code(400).send({ error: parsed.error });

      try {
        const { account } = await provisionAccount(req.user.uid, {
          ...parsed.value,
          ctrader_identity_id: id,
          ctid_trader_account_id: ctid,
          // The number the trader recognises. mt5_login carries the banded value.
          platform_login: found.trader_login ?? null,
          is_live_env: found.is_live === true,
        }, { credential: null, login: toBandedLogin(ctid) });
        created.push(account);
      } catch (err) {
        if (err.conflict === PROVISION_CONFLICT.LOGIN) {
          return reply.code(409).send({ error: 'That cTrader account is already connected', conflict: err.conflict });
        }
        throw err;
      }
    }
    return reply.code(201).send({ accounts: created });
  });

  /**
   * Disconnect a grant. The accounts and their trades are deliberately left
   * alone: a trader revoking access is saying "stop reading my broker", not
   * "delete my journal".
   */
  app.delete('/api/ctrader/identities/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid identity id' });
    const gone = await revokeIdentity(req.user.uid, id);
    return reply.send({ revoked: Boolean(gone) });
  });
}
