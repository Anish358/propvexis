// db:pull — refresh the LOCAL dev database from PRODUCTION.
//
// One-way, prod -> local. Production is only ever READ (via pg_dump); this
// script writes exclusively to your local DB, so it can never corrupt the
// live journal. Run it whenever you want real data on localhost:
//
//     npm run db:pull
//
// How it works: SSH to the EC2 box, pg_dump the prod DB to a local temp file,
// and (only if the dump is complete) restore it into the local DB from
// ./.env. The prod DB password never leaves the server — the remote side
// hydrates DATABASE_URL from AWS SSM (via the app's own src/platform/secrets.js
// loader) and pipes it straight into pg_dump, so no secret is ever printed
// or sent over the wire.
//
// Node (not bash) so this runs unmodified on Windows, macOS and Linux — the
// remote commands below still run on the (Linux) prod box regardless of the
// local OS; only the local half needed to stop assuming a bash shell exists.
//
// Override any of these via env vars if the infra changes.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, createWriteStream, readFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';

const PROD_HOST = process.env.PROD_HOST ?? '13.205.66.72';
const PROD_USER = process.env.PROD_USER ?? 'ubuntu';
const SSH_KEY = process.env.SSH_KEY ?? path.join(homedir(), '.ssh', 'amey-journal.pem');
const PROD_APP_DIR = process.env.PROD_APP_DIR ?? '/opt/amey-journal';
// Prod secrets moved off the box into AWS SSM Parameter Store; this must match
// the box's SSM_PREFIX (see ecosystem.config.cjs). Empty => fall back to .env.
const SSM_PREFIX = process.env.SSM_PREFIX ?? '/amey-journal/prod/';

const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) fail(`✗ failed to run ${cmd}: ${r.error.message}`);
  return r;
}

// --- resolve + sanity-check the LOCAL target ---
const envPath = path.join(repoRoot, '.env');
if (!existsSync(envPath)) fail('✗ No .env in repo root — aborting.');
const envText = readFileSync(envPath, 'utf8');
const match = envText.match(/^DATABASE_URL=(.*)$/m);
const LOCAL_URL = match ? match[1].trim().replace(/^"|"$/g, '') : '';
if (!LOCAL_URL) fail('✗ No DATABASE_URL in ./.env — aborting.');

// Guard: refuse unless the local target is genuinely local, so this can never
// be pointed at a remote/production host by accident.
if (!/@(127\.0\.0\.1|localhost):/.test(LOCAL_URL)) {
  fail(`✗ Refusing: DATABASE_URL in ./.env is not local (${LOCAL_URL}).`);
}

if (!existsSync(SSH_KEY)) {
  fail(`✗ SSH key not found at ${SSH_KEY} (set SSH_KEY=… to override).`);
}

// Resolve a psql binary — usually on PATH on macOS/Linux; a plain Windows
// Postgres install often doesn't add its bin/ dir to PATH, so fall back to
// the standard EDB install location.
function findPsql() {
  // A plain spawnSync (not the fail()-on-error `run` helper above) — psql
  // missing from PATH is an expected, non-fatal case here: it just means
  // "fall through to the known install-location candidates below."
  const probe = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (!probe.error && probe.status === 0) return 'psql';
  const candidates = [];
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(base)) {
      for (const v of readdirSync(base).sort().reverse()) {
        candidates.push(path.join(base, v, 'bin', 'psql.exe'));
      }
    }
  } else {
    candidates.push(
      '/opt/homebrew/opt/postgresql@16/bin/psql',
      '/usr/local/opt/postgresql@16/bin/psql',
      '/usr/lib/postgresql/16/bin/psql',
    );
  }
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    fail('✗ Could not find psql. Install PostgreSQL client tools or add psql to your PATH.');
  }
  return found;
}

const PSQL = findPsql();

const dbName = LOCAL_URL.split('/').pop();
console.log(`▶ Pulling PROD → LOCAL. This REPLACES your local '${dbName}' database.`);

const tmpDir = mkdtempSync(path.join(tmpdir(), 'amey-proddump-'));
const dumpFile = path.join(tmpDir, 'dump.sql');
const cleanup = () => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on('exit', cleanup);

console.log('→ Dumping production…');

const sshArgs = ['-i', SSH_KEY, '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new'];

let remoteCommand;
let remoteStdin;
if (SSM_PREFIX) {
  // Migrated box: secrets live in AWS SSM, not .env. Run the app's own loader
  // on the box to hydrate DATABASE_URL, then pipe it straight into pg_dump —
  // the URL never crosses the wire. hydrateSecrets() logs "[secrets] loaded
  // N" to stdout, so that call routes console.log to stderr; only pg_dump's
  // SQL reaches stdout. --clean --if-exists makes the restore idempotent;
  // --no-owner/--no-privileges drop refs to the prod-only 'amey' role.
  remoteCommand = `cd '${PROD_APP_DIR}' && SSM_PREFIX='${SSM_PREFIX}' node --input-type=module`;
  remoteStdin = `
import { hydrateSecrets } from './src/platform/secrets.js';
import { spawn } from 'node:child_process';
const stdoutLog = console.log;
console.log = (...a) => console.error(...a); // keep hydrate chatter off the dump
await hydrateSecrets();
console.log = stdoutLog;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL not found after SSM hydrate — aborting (local DB untouched).');
  process.exit(1);
}
const child = spawn('pg_dump', [url, '--no-owner', '--no-privileges', '--clean', '--if-exists'],
  { stdio: ['ignore', 'inherit', 'inherit'] });
child.on('exit', (code) => process.exit(code ?? 1));
`;
} else {
  // Un-migrated box: read only DATABASE_URL from the app .env (don't source
  // the whole file — it holds tokens/secrets), then dump. Fail loudly if
  // it's missing rather than letting pg_dump fall back to the local socket
  // as OS user 'ubuntu'.
  remoteCommand =
    `cd '${PROD_APP_DIR}' && DBURL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"') && ` +
    `{ [ -n "$DBURL" ] || { echo '✗ No DATABASE_URL in prod .env (SSM cutover? set SSM_PREFIX).' >&2; exit 1; }; } && ` +
    `pg_dump "$DBURL" --no-owner --no-privileges --clean --if-exists`;
  remoteStdin = null;
}

await new Promise((resolve, reject) => {
  const out = createWriteStream(dumpFile);
  const ssh = spawn('ssh', [...sshArgs, `${PROD_USER}@${PROD_HOST}`, remoteCommand], {
    stdio: [remoteStdin ? 'pipe' : 'ignore', 'pipe', 'inherit'],
  });
  ssh.stdout.pipe(out);
  if (remoteStdin) { ssh.stdin.write(remoteStdin); ssh.stdin.end(); }
  ssh.on('error', reject);
  out.on('finish', () => {});
  ssh.on('exit', (code) => {
    out.close(() => {
      if (code !== 0) reject(new Error(`ssh/pg_dump exited with code ${code}`));
      else resolve();
    });
  });
});

if (!existsSync(dumpFile) || statSync(dumpFile).size === 0) {
  fail('✗ Dump came back empty — local DB left untouched.');
}

const lineCount = readFileSync(dumpFile, 'utf8').split('\n').length;
console.log(`→ Restoring into local (${lineCount} SQL lines)…`);
// psql's arg parser wants options BEFORE the trailing dbname/connection-string
// positional — anything after it is silently treated as extra positionals and
// dropped (with just a warning, not a failure), so the connection string must
// come last in every invocation below.
const restore = run(PSQL, ['-q', '-f', dumpFile, LOCAL_URL], { stdio: 'inherit' });
if (restore.status !== 0) fail('✗ Restore into local DB failed.');

const count = run(PSQL, ['-tAc', 'SELECT count(*) FROM trades;', LOCAL_URL], { stdio: ['ignore', 'pipe', 'inherit'] });
console.log(`✓ Done. Local trade count: ${(count.stdout || '').trim()}`);
