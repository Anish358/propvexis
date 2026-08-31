import { config } from '../platform/config.js';
import {
  ctraderEnabled, signState, verifyState, grantUrl, exchangeCode,
} from '../domain/sync/ctraderOauth.js';
import {
  identitiesEnabled, sealTokens, createIdentity, rotateTokens,
  listIdentities, revokeIdentity, discoveredForIdentity,
} from '../domain/sync/ctraderIdentities.js';

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
