// PM2 process definition for the backend (used in production by deploy.yml:
//   pm2 startOrReload ecosystem.config.cjs --update-env
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
// This is prod-only: local dev runs `npm run dev` (SSM_PREFIX unset → the loader
// is a no-op and dotenv/.env supplies config as before).
module.exports = {
  apps: [
    {
      name: 'amey-backend',
      script: 'src/server.js',
      cwd: '/opt/amey-journal',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        AWS_REGION: 'ap-south-1',
        SSM_PREFIX: '/amey-journal/prod/',
      },
    },
  ],
};
