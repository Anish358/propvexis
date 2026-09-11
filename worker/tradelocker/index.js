// The TradeLocker job path -- auth, discovery, backfill, reconcile, report.
//
// SHARES THE PROCESS worker/ctrader/index.js runs (Task 7 ruling, design spec
// §4): both are outbound HTTP/TLS clients with a token to refresh, and there is
// no reason to run a second Node process on a 911MB box to do the same job for
// a second vendor. worker/ctrader/index.js's tick() dispatches a leased job
// here when job.platform === 'tradelocker'; nothing about the cTrader socket
// lifecycle is touched by this file.

// tradelockerConnector, not a standalone toBandedLogin export -- the brief is
// explicit that the worker imports the connector module's exports directly
// (buildResolver, pairOrders, assertFields, toBandedLogin, hosts), and on this
// module they are properties of tradelockerConnector, not top-level bindings.
import { tradelockerConnector, TRADELOCKER_HOSTS } from '../../src/domain/sync/connectors/tradelocker/index.js';
import { buildResolver } from '../../src/domain/sync/connectors/tradelocker/columns.js';
import * as auth from './auth.js';
import { getConfig } from './config.js';
import { discoverAccount } from './discover.js';
import { backfillAccount } from './backfill.js';
import { reconcile } from './reconcile.js';

const hostOf = (isLive) => (isLive ? TRADELOCKER_HOSTS.live : TRADELOCKER_HOSTS.demo);

/**
 * Ruling B: authenticate on the account's already-decided host, or -- ONLY
 * while `is_live_env` is NULL, i.e. this account has never had a successful
 * job -- try demo first and live once on a 401. One extra request, once per
 * account, ever: every later job already knows which host, because queue.js
 * reads `mt5_accounts.is_live_env` straight through uncoerced (see
 * tradelockerLeasedPayloadQuery) and routes/sync.js writes it back on this
 * job's own result.
 */
export async function authenticate(job, { fetchImpl } = {}) {
  const creds = { email: job.email, password: job.password, server: job.server, fetchImpl };
  if (job.is_live_env != null) {
    const isLive = job.is_live_env === true;
    const tokens = await auth.login({ ...creds, isLive });
    return { ...tokens, isLive };
  }
  try {
    const tokens = await auth.login({ ...creds, isLive: false });
    return { ...tokens, isLive: false };
  } catch (err) {
    if (err.status !== 401) throw err;
    const tokens = await auth.login({ ...creds, isLive: true });
    return { ...tokens, isLive: true };
  }
}

/**
 * Run one leased TradeLocker job end to end: auth -> discover (first job for
 * the account only, i.e. `tl_account_id == null`) -> backfill -> reconcile ->
 * report.
 */
export async function runJob(job, { api, log = console, fetchImpl = fetch } = {}) {
  const { accessToken, isLive } = await authenticate(job, { fetchImpl });
  const host = hostOf(isLive);

  let tlAccountId = job.tl_account_id;
  let tlAccNum = job.tl_acc_num;
  if (tlAccountId == null) {
    // Ruling A is enforced inside discoverAccount: more than one account for
    // this login throws rather than picking one, and the caller (tick(), in
    // worker/ctrader/index.js) reports that as a failed job with the
    // credential's last_error set -- same path a decrypt failure takes.
    const found = await discoverAccount({ host, token: accessToken, isLive, fetchImpl });
    tlAccountId = found.accountId;
    tlAccNum = found.accNum;
    log.info?.({ account: job.account_id, tlAccountId, tlAccNum, isLive }, 'tradelocker account discovered');
  }

  const bandedLogin = tradelockerConnector.toBandedLogin(tlAccountId);
  const config = await getConfig({ host, token: accessToken, accNum: tlAccNum, fetchImpl });
  const resolver = buildResolver(config, 'ordersHistory');

  const { posted, windows, pnlSum, pnlCount } = await backfillAccount({
    host, token: accessToken, accNum: tlAccNum, accountId: tlAccountId,
    resolver, api, job, bandedLogin, log, fetchImpl,
  });

  const recon = await reconcile({
    host, token: accessToken, accNum: tlAccNum, accountId: tlAccountId, config,
    computedPnlSum: pnlSum, pnlCount, fetchImpl, log,
  });

  // NEVER `read_only`. That key is the MT5-only master-password rejection
  // branch in routes/sync.js's `/api/sync/jobs/:id/result` handler, and
  // TradeLocker has no read-only credential to report on at all -- every
  // TradeLocker credential is legitimately trade-capable (design spec §5).
  // Sending it, even `true`, would trip a branch that means something
  // different on this platform.
  await api.report(job.job_id, {
    ok: true,
    stats: { posted, windows, reconcile: recon },
    tl_account_id: tlAccountId,
    tl_acc_num: tlAccNum,
    is_live_env: isLive,
  });
  log.info?.(
    { account: job.account_id, posted, windows, isLive, delta: recon.delta },
    'tradelocker job done',
  );
}
