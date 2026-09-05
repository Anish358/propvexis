import { config } from '../platform/config.js';
import { ownedAccountById, bindOrCheckLogin, ensureIngestToken } from '../domain/accounts/accounts.js';
import { planForUser } from '../domain/billing/entitlements.js';
import { canUseEA } from '../domain/billing/plans.js';
import {
  enqueue,
  enqueueDue,
  leaseJobs,
  leasedPayloads,
  ctraderLeasedPayloads,
  splitJobsByPlatform,
  completeJob,
  failJob,
  reclaimExpired,
  heartbeat,
  lastJob,
  jobForWorker,
  isMarketOpen,
  requestedPlatforms,
  manualCooldown,
  MANUAL_COOLDOWN_MS,
} from '../domain/sync/queue.js';
import { workerTokenMatches } from '../domain/sync/workerAuth.js';
import { freshAccessToken, markIdentityError } from '../domain/sync/ctraderIdentities.js';
import {
  credentialsEnabled,
  credentialStatus,
  saveCredential,
  deleteCredential,
  markVerified,
  markError,
  rejectMasterPassword,
  openPassword,
} from '../domain/sync/credentials.js';

/**
 * Server-side MT5 sync: the API half of the self-hosted terminal farm.
 *
 * Two audiences, two auth schemes:
 *
 *  - the off-box Windows agent (bearer SYNC_WORKER_TOKEN) leases jobs, receives
 *    the decrypted investor password for the leased account, and reports results;
 *  - the signed-in user attaches or removes a credential and asks for a sync.
 *
 * The agent posts the trades themselves to the EXISTING ingest endpoints with the
 * account's own ingest_token, so nothing here touches the trade path — dedup,
 * derivation and alerting stay in one place for both the EA and the farm.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply.
 */
export default function syncRoutes(app) {
  // --- worker auth -----------------------------------------------------------
  // Timing-safe and closed when unconfigured — see domain/sync/workerAuth.js.
  const requireWorker = async (req, reply) => {
    if (!workerTokenMatches(req.headers.authorization, config.syncWorkerToken)) {
      return reply.code(401).send({ error: 'worker not authorized' });
    }
  };

  // Shared guard for the user-facing routes: the account must be the caller's,
  // must be a real MT5 account rather than a manual bucket, and the plan must
  // include live sync. Returns the account or sends the response itself.
  const ownedSyncAccount = async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      reply.code(400).send({ error: 'invalid account id' });
      return null;
    }
    const acct = await ownedAccountById(req.user.uid, id);
    if (!acct) {
      reply.code(404).send({ error: 'account not found' });
      return null;
    }
    if (acct.kind !== 'synced') {
      reply.code(400).send({ error: 'manual accounts cannot be synced from a terminal' });
      return null;
    }
    if (!canUseEA(await planForUser(req.user.uid))) {
      reply.code(402).send({ error: 'live sync requires the Pro plan' });
      return null;
    }
    return acct;
  };

  // ---------------------------------------------------------------------------
  // Worker endpoints
  // ---------------------------------------------------------------------------

  /**
   * Lease work. One call does the whole housekeeping cycle, because the agent is
   * the only thing that runs on a schedule and a separate cron on the API box
   * would be a second thing to keep alive:
   *
   *   heartbeat -> reclaim dead leases -> queue what is due -> lease -> hand over
   *
   * The response is the ONLY place a plaintext password appears. It is not
   * logged, and a credential that fails to decrypt fails its job rather than
   * being skipped silently.
   */
  app.post('/api/sync/lease', { preHandler: requireWorker }, async (req, reply) => {
    const body = req.body ?? {};
    const workerId = String(body.worker_id ?? '').slice(0, 64);
    if (!workerId) return reply.code(400).send({ error: 'worker_id required' });
    if (!credentialsEnabled()) {
      return reply.code(503).send({ error: 'sync not configured (SYNC_CRED_KEY)' });
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 1), 1), 5);
    await heartbeat(workerId, body.version ?? null, body.note ?? null);
    const reclaimed = await reclaimExpired();
    // Scheduled syncs pause over the weekend; a manual "Sync now" is already in
    // the queue by the time we get here, so it is unaffected.
    const queued = isMarketOpen() ? await enqueueDue() : [];
    const leased = await leaseJobs(workerId, limit, undefined, requestedPlatforms(body));
    // ONE QUERY PER PLATFORM. The MT5 payload query INNER JOINs mt5_credentials,
    // which a cTrader account has no row in -- serving both through it returns no
    // row for cTrader, and the job then leases, reports nothing, expires and is
    // reclaimed forever with no error anywhere. See ctraderLeasedPayloadQuery.
    const byPlatform = splitJobsByPlatform(leased);
    const rows = await leasedPayloads(byPlatform.mt5);

    const jobs = [];
    for (const row of rows) {
      let password;
      try {
        password = openPassword(row);
      } catch (err) {
        // Unusable credential: burn the job with a clear reason rather than
        // handing the agent something it cannot log in with. The user sees this
        // in the sync panel.
        req.log.error({ account: row.account_id, err: err.message }, 'credential failed to decrypt');
        await failJob(row.job_id, 'stored credential could not be decrypted');
        await markError(row.account_id, 'credential unreadable — re-enter the investor password');
        continue;
      }
      jobs.push({
        job_id: Number(row.job_id),
        account_id: Number(row.account_id),
        login: row.mt5_login == null ? null : Number(row.mt5_login),
        server: row.server,
        firm_key: row.firm_key,
        password,
        ingest_token: row.ingest_token,
        since: row.since,
        reason: row.reason,
        first_sync: row.verified_at == null,
      });
    }

    // ---- cTrader ---------------------------------------------------------
    // The worker is handed a READY-TO-USE ACCESS TOKEN and never a refresh token.
    // The refresh token is consumed on use (landmine 10.2), so a rotation the
    // worker completed but failed to send back would be unrecoverable and the
    // user's connection would break for no visible reason. Refresh lives here,
    // next to the store that records it.
    for (const row of await ctraderLeasedPayloads(byPlatform.ctrader)) {
      let token;
      try {
        ({ accessToken: token } = await freshAccessToken(row));
      } catch (err) {
        req.log.error(
          { account: row.account_id, identity: row.identity_id, err: err.message },
          'ctrader token unusable',
        );
        await failJob(row.job_id, 'cTrader authorization expired — reconnect the account');
        await markIdentityError(row.identity_id, err.message.slice(0, 1000));
        continue;
      }
      jobs.push({
        job_id: Number(row.job_id),
        account_id: Number(row.account_id),
        platform: 'ctrader',
        ctid_trader_account_id: Number(row.ctid_trader_account_id),
        // Landmine 10.7: which of the two sockets this account lives on. Decided
        // at discovery, never recomputed.
        is_live: row.is_live_env === true,
        access_token: token,
        identity_id: Number(row.identity_id),
        ingest_token: row.ingest_token,
        login: row.mt5_login == null ? null : Number(row.mt5_login),
        since: row.since,
        cursor_at: row.cursor_at,
        reason: row.reason,
      });
    }

    // A job whose platform we do not recognise must FAIL, not vanish. Dropping it
    // recreates the same lease-expire-reclaim spin in a different place.
    for (const jobId of byPlatform.unknown) {
      req.log.error({ job: jobId }, 'leased job has no known platform');
      await failJob(jobId, 'job has no known platform');
    }

    return reply.send({
      jobs,
      housekeeping: { reclaimed: reclaimed.length, queued: queued.length, market_open: isMarketOpen() },
    });
  });

  /**
   * Report a finished job.
   *
   * `read_only` is the enforcement point for the investor-password-only rule: the
   * agent reads account_info().trade_allowed after logging in, and if the
   * credential can trade we delete it here. That makes "we only ever read" a
   * property the code checks rather than a promise in a policy document.
   */
  app.post('/api/sync/jobs/:id/result', { preHandler: requireWorker }, async (req, reply) => {
    const jobId = Number(req.params.id);
    if (!Number.isFinite(jobId)) return reply.code(400).send({ error: 'invalid job id' });
    const b = req.body ?? {};
    const workerId = String(b.worker_id ?? '').slice(0, 64);
    if (!workerId) return reply.code(400).send({ error: 'worker_id required' });

    // Which account this result is about comes from the JOB, never from the body.
    // The body is written by a box we treat as hostile: trusting an account_id
    // from it would let any token-holding caller mark another tenant's credential
    // "verified read-only" without a login ever happening, or delete it outright.
    // Requiring the lease holder also stops one worker closing another's job.
    const owned = await jobForWorker(jobId, workerId);
    if (!owned) return reply.code(409).send({ error: 'job is not leased by this worker' });
    const accountId = Number(owned.account_id);

    if (b.read_only === false) {
      await rejectMasterPassword(accountId);
      await failJob(jobId, 'master password supplied — deleted; enter the investor (read-only) password');
      return reply.send({ ok: false, credential: 'rejected' });
    }

    if (b.ok) {
      await markVerified(accountId);
      const job = await completeJob(jobId, b.stats ?? {});
      if (!job) return reply.code(409).send({ error: 'job is not leased' });
      return reply.send({ ok: true, job });
    }

    const error = String(b.error ?? 'sync failed').slice(0, 1000);
    await markError(accountId, error);
    const job = await failJob(jobId, error);
    if (!job) return reply.code(409).send({ error: 'job is not leased' });
    return reply.send({ ok: false, job });
  });

  /** Liveness only — for the stretch between leases when there is no work. */
  app.post('/api/sync/heartbeat', { preHandler: requireWorker }, async (req, reply) => {
    const workerId = String(req.body?.worker_id ?? '').slice(0, 64);
    if (!workerId) return reply.code(400).send({ error: 'worker_id required' });
    const [row] = await heartbeat(workerId, req.body?.version ?? null, req.body?.note ?? null);
    return reply.send({ ok: true, last_seen: row?.last_seen ?? null });
  });

  // ---------------------------------------------------------------------------
  // User endpoints
  // ---------------------------------------------------------------------------

  /** Credential + last-job status for one account. Never returns the password. */
  app.get('/api/accounts/:id/sync', { preHandler: app.requireAuth }, async (req, reply) => {
    const acct = await ownedSyncAccount(req, reply);
    if (!acct) return reply;
    const [cred, job] = await Promise.all([
      credentialStatus(req.user.uid, acct.id),
      lastJob(acct.id),
    ]);
    return reply.send({
      configured: credentialsEnabled(),
      credential: cred,
      last_job: job,
      market_open: isMarketOpen(),
    });
  });

  /**
   * Attach an investor password. Requires the MT5 login too when the account has
   * never been bound — the farm cannot discover the login the way the EA does
   * (the EA learns it from the first trade it sends).
   */
  app.put('/api/accounts/:id/credentials', { preHandler: app.requireAuth }, async (req, reply) => {
    const acct = await ownedSyncAccount(req, reply);
    if (!acct) return reply;
    if (!credentialsEnabled()) {
      // Refusing is the right failure: storing a broker password we cannot
      // encrypt would be worse than not offering the feature.
      return reply.code(503).send({ error: 'sync not configured (SYNC_CRED_KEY)' });
    }

    const b = req.body ?? {};
    const server = String(b.server ?? '').trim();
    const password = String(b.password ?? '');
    if (!server) return reply.code(400).send({ error: 'server required' });
    if (!password) return reply.code(400).send({ error: 'password required' });

    const login = b.login == null ? null : Number(b.login);
    if (acct.mt5_login == null) {
      if (!Number.isFinite(login) || login <= 0) {
        return reply.code(400).send({ error: 'login required for an unbound account' });
      }
      const bind = await bindOrCheckLogin(acct, login);
      if (bind === 'mismatch') return reply.code(403).send({ error: 'login does not match this account' });
      if (bind === 'conflict') return reply.code(409).send({ error: 'this MT5 login is already registered to another account' });
    } else if (Number.isFinite(login) && Number(acct.mt5_login) !== login) {
      return reply.code(403).send({ error: 'login does not match this account' });
    }

    // The agent authenticates to the ingest endpoints with this, exactly as the EA
    // does. Accounts predating per-account tokens have none, so mint one rather
    // than refuse — a 409 here was a dead end, with no button anywhere in the app
    // that could produce a token.
    if (!(await ensureIngestToken(req.user.uid, acct.id))) {
      return reply.code(409).send({ error: 'could not issue an ingest token for this account' });
    }

    const saved = await saveCredential({
      accountId: acct.id,
      server,
      firmKey: b.firm_key ?? null,
      password,
    });
    // Sync immediately: the first run is what proves the credential works, and
    // it is also what backfills the history the user came here for.
    const job = await enqueue(acct.id, 'first_sync');
    return reply.code(201).send({ credential: saved, job });
  });

  app.delete('/api/accounts/:id/credentials', { preHandler: app.requireAuth }, async (req, reply) => {
    const acct = await ownedSyncAccount(req, reply);
    if (!acct) return reply;
    const gone = await deleteCredential(req.user.uid, acct.id);
    return reply.send({ deleted: Boolean(gone) });
  });

  /**
   * Manual "Sync now". Returns 202 with `queued: false` when a job is already
   * open for the account — the partial unique index makes that a no-op rather
   * than a backlog, so pressing the button twice is harmless.
   *
   * A 15-MINUTE COOLDOWN IS ENFORCED HERE, not in the button.
   *
   * The unique index only stops a pile-up while a job is OPEN; the moment one
   * finishes, the account is pressable again immediately. That was tolerable when
   * a platform's rate limit was its own, and is not now: TradeLocker's limits are
   * per-route and SHARED across every user, because every request leaves this box
   * from one egress IP. One impatient trader holding down Sync now degrades every
   * other customer's sync. A disabled button is a suggestion — this is the limit.
   */
  app.post('/api/accounts/:id/sync', { preHandler: app.requireAuth }, async (req, reply) => {
    const acct = await ownedSyncAccount(req, reply);
    if (!acct) return reply;
    const cred = await credentialStatus(req.user.uid, acct.id);
    if (!cred) return reply.code(409).send({ error: 'no credential stored for this account' });
    // MT5 only: read_only === false is a master password awaiting deletion. On a
    // platform with no read-only credential at all it is simply the normal state,
    // and refusing it here would make Sync now permanently unusable there.
    if (acct.platform === 'mt5' && cred.read_only === false) {
      return reply.code(409).send({ error: 'stored credential can trade — enter the investor password' });
    }

    const previous = await lastJob(acct.id);
    const cooldown = manualCooldown(previous);
    if (cooldown.blocked) {
      const retryAfter = Math.ceil(cooldown.retryAfterMs / 1000);
      // The message carries the WAIT, because the client renders `error` verbatim
      // (see frontend/src/lib/api.js syncCall). "Synced recently" with no number
      // is the kind of refusal a user retries immediately, which is the behaviour
      // this endpoint exists to prevent.
      const mins = Math.ceil(retryAfter / 60);
      return reply
        .code(429)
        .header('Retry-After', retryAfter)
        .send({
          error: `already synced recently — try again in ${mins} minute${mins === 1 ? '' : 's'}`,
          retry_after_seconds: retryAfter,
          cooldown_seconds: Math.round(MANUAL_COOLDOWN_MS / 1000),
        });
    }

    const job = await enqueue(acct.id, 'manual');
    return reply.code(202).send({ queued: Boolean(job), job });
  });
}
