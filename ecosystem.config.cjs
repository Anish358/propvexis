// PM2 process definitions for the backend (used in the deploy workflows:
//   pm2 startOrReload ecosystem.config.cjs --only <app> --update-env
//
// Why this file exists: the bootstrap env vars below — especially SSM_PREFIX —
// must be REAL process environment variables, because src/secrets.js reads
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

function app({ name, cwd, port, ssmPrefix }) {
  return {
    name,
    script: 'src/server.js',
    cwd,
    instances: 1,
    exec_mode: 'fork',
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
    }),
    app({
      name: 'amey-backend-staging',
      cwd: '/opt/amey-staging',
      port: 3011,
      ssmPrefix: '/amey-journal/staging/',
    }),
    app({
      name: 'amey-backend-dev',
      cwd: '/opt/amey-dev',
      port: 3012,
      ssmPrefix: '/amey-journal/dev/',
    }),
  ],
};
