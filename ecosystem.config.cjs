// PM2 process definitions for the backend (used in the deploy workflows:
//   pm2 startOrReload ecosystem.config.cjs --only <app> --update-env
//
// Why this file exists: the bootstrap env vars below — especially SSM_PREFIX —
// must be REAL process environment variables, because src/platform/secrets.js reads
// SSM_PREFIX to decide whether to hydrate secrets from AWS SSM *before* dotenv
// loads .env (dotenv runs later, inside app.js → config.js). Defining them here
// makes them file-based and version-controlled, so they survive a fresh
// `pm2 start`, a `pm2 delete` + restart, or a reboot — instead of living only in
// pm2's in-memory/dump state. On the box, .env holds NO secrets; they come from
// SSM Parameter Store under SSM_PREFIX. See terraform/README.md.
//
// This is prod-only machinery: local dev runs `npm run dev` (SSM_PREFIX unset →
// the loader is a no-op and dotenv/.env supplies config as before).
//
// THREE ENVIRONMENTS live on the same box, one pm2 app each, isolated by port,
// working directory, Postgres DB, and SSM prefix. Each env's deploy workflow
// targets exactly its own app via `--only`, so deploying one never touches the
// others. PORT is set here (not left to SSM) so it wins over any SSM PORT param
// (applyParams is set-if-absent) and each app binds its own port deterministically.
//
// Ports avoid the loopback services already on the box: Grafana (3001) and
// Prometheus (9090). Staging/dev use a contiguous 3011/3012 block.
//
//   env      branch     port   dir                    ssm prefix
//   -------  ---------   ----   --------------------   ------------------------
//   prod     main        3000   /opt/amey-journal      /amey-journal/prod/
//   staging  amey-dev    3011   /opt/amey-staging      /amey-journal/staging/
//   dev      dev         3012   /opt/amey-dev          /amey-journal/dev/

// ---------------------------------------------------------------------------
// WORKERS PER ENV — deliberately 1. Read this before changing it.
//
// More than one worker is the fix for "one Node process pinned to one core", and
// the code supports it (exec_mode flips to cluster automatically below).
//
// The two CORRECTNESS blockers are now solved in code by the Redis layer:
//   * shared Socket.IO adapter  (@socket.io/redis-adapter, wired in app.js)
//   * shared cache invalidation (src/platform/statsBus.js over Redis pub/sub)
// Both are inert unless REDIS_URL is set.
//
// It is still 1 because of the OPERATIONAL prerequisites:
//   1. REDIS_URL must be provisioned for the env (SSM). Without it, clustered
//      workers drop realtime events and serve stale analytics. The box's Docker
//      daemon is stopped to save memory, so prefer a native
//      `apt install redis-server` bound to 127.0.0.1 (~10MB) over a container.
//   2. HEADROOM. The box is a 1GB t3.micro running all three envs (the
//      observability containers are stopped on purpose to fit). Each worker is
//      ~90-150MB RSS, so a second prod worker needs an instance upsize.
//   3. Postgres connections are workers x PG_POOL_MAX against
//      max_connections=100 shared by three envs — see advisePoolMax() in
//      src/platform/cluster.js and LOWER PG_POOL_MAX before raising this.
//
// src/platform/cluster.js re-checks the shared-state blockers at boot from LIVE Redis
// state and logs a loud warning (plus the app_unsafe_cluster_mode gauge) if the
// app finds itself clustered without them, so this cannot silently regress.
// ---------------------------------------------------------------------------
const WORKERS = { prod: 1, staging: 1, dev: 1 };

function app({ name, cwd, port, ssmPrefix, appEnv, workers = 1 }) {
  return {
    name,
    script: 'src/server.js',
    cwd,
    instances: workers,
    // fork while there is a single worker (cheapest, and what this box runs
    // today); cluster only once workers > 1, which needs the shared state above.
    exec_mode: workers > 1 ? 'cluster' : 'fork',
    env: {
      NODE_ENV: 'production',
      AWS_REGION: 'ap-south-1',
      // Bind loopback: only Caddy (same box) proxies to these ports. Pinned here
      // (not left to SSM) so every env binds 127.0.0.1 even if its SSM tree has
      // no HOST param — the internet reaches the app only through Caddy's TLS
      // vhosts, never the raw backend port. Prod already binds loopback, so this
      // is a no-op there.
      HOST: '127.0.0.1',
      PORT: String(port),
      SSM_PREFIX: ssmPrefix,
      // Which deployment this is. NODE_ENV can't distinguish them (all three are
      // 'production'), and the three envs SHARE ONE REDIS whose pub/sub is global
      // across databases — so this prefix is what stops a prod socket broadcast
      // reaching a staging client. Those DBs are replicas of prod, so the user
      // ids match and the events would actually be delivered.
      APP_ENV: appEnv,
    },
  };
}

module.exports = {
  apps: [
    app({
      name: 'amey-backend',
      cwd: '/opt/amey-journal',
      port: 3000,
      ssmPrefix: '/amey-journal/prod/',
      appEnv: 'prod',
      workers: WORKERS.prod,
    }),
    app({
      name: 'amey-backend-staging',
      cwd: '/opt/amey-staging',
      port: 3011,
      ssmPrefix: '/amey-journal/staging/',
      appEnv: 'staging',
      workers: WORKERS.staging,
    }),
    app({
      name: 'amey-backend-dev',
      cwd: '/opt/amey-dev',
      port: 3012,
      ssmPrefix: '/amey-journal/dev/',
      appEnv: 'dev',
      workers: WORKERS.dev,
    }),
  ],
};
