import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';

const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');
const deployEnv = read('.github/workflows/deploy-env.yml');
const ecosystem = await import('../ecosystem.config.cjs').then((m) => m.default);

test('the deploy actually ships worker/', () => {
  /* THE SILENT FAILURE THIS CATCHES. The rsync line is an explicit list --
   * `package.json package-lock.json ecosystem.config.cjs src db scripts ea` --
   * not a whole-tree copy. A new top-level directory is simply not sent, and
   * nothing fails: the deploy is green, the web tier is new, and pm2 restarts a
   * worker whose files never arrived. */
  // The SOURCE rsync is the one listing package.json; the second block is the
  // built frontend and legitimately ships no worker.
  const rsync = deployEnv.split('\n')
    .filter((l) => l.includes('package.json package-lock.json'))
    .join('\n');
  assert.ok(rsync, 'could not find the source rsync line — has the deploy changed shape?');
  assert.match(rsync, /\bworker\b/, 'worker/ must be in the rsync list or it never reaches the box');
});

test('the worker is reloaded, not left running the previous build', () => {
  // `pm2 startOrReload --only "$PM2_APP"` touches exactly ONE app. Without a
  // second call the box keeps the old worker after every deploy: new code on the
  // web tier, stale code on the broker socket, and nothing says so.
  assert.match(deployEnv, /--only "\$PM2_WORKER"/);
  assert.match(deployEnv, /if \[ -n "\$\{PM2_WORKER:-\}" \]/,
    'an environment with no worker must skip the reload rather than fail the deploy');
});

test('PM2_WORKER REACHES THE REMOTE SHELL, not just the workflow step', () => {
  /* THE BUG THIS CATCHES, AND IT SHIPPED — the worker never started once, on any
   * environment, through several green deploys.
   *
   * The remote script runs over ssh with an EXPLICIT env allow-list:
   *
   *     "APP_DIR='$APP_DIR' PM2_APP='$PM2_APP' bash -s" <<'REMOTE'
   *
   * PM2_WORKER was set as an env var of the workflow STEP, which the remote bash
   * never sees. So `${PM2_WORKER:-}` was empty on the box, the `if` never fired,
   * and pm2 was never asked to start the worker. Deploy green, files rsynced,
   * ecosystem correct, no worker, nothing in any log.
   *
   * The two assertions above passed the whole time, because they only proved the
   * TEXT existed — not that the variable it reads could ever be set. A guard on a
   * shell script has to follow the value, not the line. */
  const ssh = deployEnv.split('\n').find((l) => l.includes("bash -s"));
  assert.ok(ssh, 'could not find the remote shell invocation');
  assert.match(ssh, /PM2_WORKER='\$PM2_WORKER'/,
    'PM2_WORKER must be exported into the remote shell or the if is dead code');
  // ...and every variable the remote script reads must be transported.
  const remote = deployEnv.slice(deployEnv.indexOf("bash -s"));
  for (const v of ['APP_DIR', 'PM2_APP', 'PM2_WORKER']) {
    if (new RegExp(`\\$\\{?${v}[:}\\s"]`).test(remote)) {
      assert.match(ssh, new RegExp(`${v}='\\$${v}'`), `${v} is read remotely but never sent`);
    }
  }
});

test('prod and dev each name their own worker; staging names none', () => {
  assert.match(read('.github/workflows/deploy.yml'), /pm2_worker: amey-ctrader\b/);
  assert.match(read('.github/workflows/deploy-dev.yml'), /pm2_worker: amey-ctrader-dev/);
  // Staging is the environment stopped to fund the worker's memory (spec §3.4).
  assert.doesNotMatch(read('.github/workflows/deploy-staging.yml'), /pm2_worker/);
});

test('the worker runs as ONE fork, and must stay that way', () => {
  /* Spotware's guidance is at most two connections -- one per environment --
   * each serving unlimited accounts. Two worker instances would open two live
   * sockets and DOUBLE-DELIVER every execution event, ingesting each trade twice
   * under the same dealId. Dedup would hide it at the trade level and the
   * duplicated work would still be real. */
  for (const app of ecosystem.apps.filter((a) => a.script.includes('worker/ctrader'))) {
    assert.equal(app.instances, 1, `${app.name} must be a single instance`);
    assert.equal(app.exec_mode, 'fork', `${app.name} must never be clustered`);
  }
});

test('each worker points at its OWN environment, on loopback', () => {
  // Cross-environment ingest would put prod trades in the dev database or the
  // reverse. The three envs share a box and differ only by port and SSM prefix.
  const byName = Object.fromEntries(ecosystem.apps.map((a) => [a.name, a]));
  assert.equal(byName['amey-ctrader'].env.PROPVEXIS_URL, 'http://127.0.0.1:3000');
  assert.equal(byName['amey-ctrader'].env.SSM_PREFIX, '/amey-journal/prod/');
  assert.equal(byName['amey-ctrader-dev'].env.PROPVEXIS_URL, 'http://127.0.0.1:3012');
  assert.equal(byName['amey-ctrader-dev'].env.SSM_PREFIX, '/amey-journal/dev/');
  // Distinct worker ids, or the two would fight over each other's leases: the
  // lease is claimed BY worker_id and only its holder may report the result.
  assert.notEqual(
    byName['amey-ctrader'].env.CTRADER_WORKER_ID,
    byName['amey-ctrader-dev'].env.CTRADER_WORKER_ID,
  );
});

test('the worker entry hydrates SSM BEFORE importing anything that reads env', () => {
  /* The same ordering trap src/server.js documents. A static import is hoisted
   * above the await, so the worker would read process.env before SSM filled it,
   * fail its own startup check, and look like a missing SSM parameter rather than
   * an ordering bug. */
  const main = read('worker/ctrader/main.js');
  assert.match(main, /await hydrateSecrets\(\)/);
  assert.match(main, /await import\('\.\/index\.js'\)/,
    'the worker must be imported dynamically, after hydration');
  assert.doesNotMatch(main, /^import .*\.\/index\.js/m, 'a static import would be hoisted');
});

test('the vendored protobuf definitions ship with the worker', () => {
  // protobufjs loads these at runtime from disk. Without them the worker starts
  // and dies on its first message, on the box only.
  for (const f of ['OpenApiMessages.proto', 'OpenApiModelMessages.proto',
    'OpenApiCommonMessages.proto', 'OpenApiCommonModelMessages.proto']) {
    assert.ok(read(`worker/ctrader/proto/${f}`).length > 100, `${f} must be vendored`);
  }
  assert.match(read('worker/ctrader/proto/LICENSE'), /MIT/, 'keep Spotware\'s licence with their files');
});
