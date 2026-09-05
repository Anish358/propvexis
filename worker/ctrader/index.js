// The cTrader worker.
//
// A separate process from Fastify, for two reasons. The web tier is destined for
// pm2 cluster mode, and N cluster workers each holding a cTrader socket would
// each receive every execution event and race to ingest it. And a long-lived
// protobuf socket has a lifecycle -- reconnect, re-auth, watchdog -- that has no
// business sharing a process with request handling.
//
// TWO SOCKETS, FOR EVERY ACCOUNT PROPVEXIS WILL EVER HAVE. Spotware's own
// guidance is one connection per environment, each supporting unlimited accounts.
// That is why this connector is orthogonal to the 1000-user bar.

import { CtraderConnection, backoffMs } from './connection.js';
import { PropVexisApi } from './api.js';
import { discoverAccounts, fetchCtidUserId } from './discover.js';
import { backfillAccount } from './backfill.js';

const log = {
  info: (o, m) => console.log(JSON.stringify({ level: 'info', m, ...o })),
  error: (o, m) => console.error(JSON.stringify({ level: 'error', m, ...o })),
};



class Worker {
  constructor() {
    this.api = new PropVexisApi({
      baseUrl: process.env.PROPVEXIS_URL ?? 'http://127.0.0.1:3000',
      workerToken: process.env.SYNC_WORKER_TOKEN,
      workerId: process.env.CTRADER_WORKER_ID ?? `ctrader-${process.pid}`,
    });
    this.conns = new Map();   // 'live' | 'demo' -> CtraderConnection
    this.stopping = false;
  }

  /** The socket for an environment, opened and application-authenticated once. */
  async connection(isLive) {
    const key = isLive ? 'live' : 'demo';
    const existing = this.conns.get(key);
    if (existing?.socket && existing.appAuthed) return existing;

    const conn = new CtraderConnection({
      isLive,
      clientId: process.env.CTRADER_CLIENT_ID,
      clientSecret: process.env.CTRADER_CLIENT_SECRET,
      log,
    });
    conn.on('down', (err) => {
      log.error({ env: key, err: err.message }, 'ctrader socket down');
      this.conns.delete(key);
    });
    // Landmine 10.1: a token refresh terminates the sessions of the named
    // accounts while the socket and every other account survive. Forgetting them
    // is enough -- the next job that needs one re-authorizes it.
    conn.on('accountsInvalidated', ({ ids, reason }) => {
      log.info({ env: key, ids, reason }, 'ctrader sessions invalidated');
    });

    for (let attempt = 0; ; attempt += 1) {
      try {
        await conn.open();
        break;
      } catch (err) {
        if (attempt >= 5) throw err;
        const wait = backoffMs(attempt);
        log.error({ env: key, err: err.message, wait }, 'ctrader connect failed, retrying');
        await new Promise((r) => { setTimeout(r, wait); });
      }
    }
    this.conns.set(key, conn);
    return conn;
  }

  /** Enumerate accounts for any identity the user has just connected. */
  async runDiscovery() {
    let pending;
    try { ({ identities: pending } = await this.api.pendingDiscovery()); } catch (err) {
      log.error({ err: err.message }, 'ctrader discovery poll failed');
      return;
    }
    for (const { identity_id: id, access_token: token } of pending ?? []) {
      try {
        // The account list is the same from either endpoint and describes both
        // environments; isLive on each row is what sorts them afterwards.
        const conn = await this.connection(false);
        const { accounts } = await discoverAccounts({ conn, accessToken: token });
        let ctidUserId = null;
        try { ctidUserId = await fetchCtidUserId({ conn, accessToken: token }); } catch { /* optional */ }
        await this.api.storeDiscovered(id, ctidUserId, accounts);
        log.info({ identity: id, found: accounts.length }, 'ctrader discovery done');
      } catch (err) {
        log.error({ identity: id, err: err.message }, 'ctrader discovery failed');
      }
    }
  }

  async runJob(job) {
    const conn = await this.connection(job.is_live);
    // Authorizing is idempotent and cheap; doing it per job is what makes a
    // reconnect self-healing without tracking which accounts a new socket has.
    await conn.authAccount(job.ctid_trader_account_id, job.access_token);

    const { posted, windows } = await backfillAccount({
      conn, api: this.api, job, throttle: conn.throttle, log,
    });
    await this.api.report(job.job_id, { ok: true, stats: { posted, windows } });
    log.info({ account: job.account_id, posted, windows }, 'ctrader job done');
  }

  async tick() {
    await this.runDiscovery();

    let leased;
    try { leased = await this.api.lease(3); } catch (err) {
      log.error({ err: err.message }, 'ctrader lease failed');
      return;
    }
    const jobs = leased?.jobs ?? [];
    if (!jobs.length) {
      await this.api.heartbeat('idle').catch(() => {});
      return;
    }
    for (const job of jobs) {
      try {
        await this.runJob(job);
      } catch (err) {
        log.error({ job: job.job_id, err: err.message }, 'ctrader job failed');
        // Reporting the failure is what stops the lease expiring and the job
        // being reclaimed forever with nothing recorded.
        await this.api.report(job.job_id, { ok: false, error: err.message }).catch(() => {});
      }
    }
  }

  async run() {
    log.info({ url: this.api.baseUrl, worker: this.api.workerId }, 'ctrader worker started');
    while (!this.stopping) {
      await this.tick();
      const idle = Number(process.env.CTRADER_IDLE_MS ?? 15_000);
      if (!this.stopping) await new Promise((r) => { setTimeout(r, idle); });
    }
  }

  stop() {
    this.stopping = true;
    for (const c of this.conns.values()) c.close();
  }
}

export { Worker };

/** Start the worker. Called by main.js AFTER secrets are hydrated. */
export function start() {
  const missing = ['CTRADER_CLIENT_ID', 'CTRADER_CLIENT_SECRET', 'SYNC_WORKER_TOKEN']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    // Fail closed and loudly. A worker that starts without credentials leases
    // jobs it can never run, fails them, and looks like a broker problem.
    log.error({ missing }, 'ctrader worker cannot start');
    process.exit(1);
  }

  const worker = new Worker();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { worker.stop(); setTimeout(() => process.exit(0), 500).unref(); });
  }
  worker.run().catch((err) => {
    log.error({ err: err.message, stack: err.stack }, 'ctrader worker crashed');
    process.exit(1);
  });
  return worker;
}
