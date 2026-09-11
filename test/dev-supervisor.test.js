import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backoffMs,
  isSourceChange,
  classifyExit,
  HEALTHY_AFTER_MS,
} from '../scripts/dev.js';
import { proxyErrorMessage, attachProxyErrorHandler } from '../frontend/vite.proxy-error.js';

/* THE DEV SUPERVISOR — see scripts/dev.js for the full account.
 *
 * The bug, in one line: `node --watch` does not restart a process that CRASHED,
 * so the backend stayed dead for hours while the terminal looked healthy and the
 * browser said `Sign-in failed: login 502`. Prod has pm2. Dev had nothing.
 *
 * The integration tests below are the ones that matter — they prove the actual
 * behaviour rather than the policy around it, including a control that pins the
 * broken behaviour of the thing we replaced. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPERVISOR = path.join(ROOT, 'scripts', 'dev.js');

test('the first restart is immediate, then it backs off and caps', () => {
  // Immediate, because the common case is one bad request and half a second of
  // recovery latency is half a second of the 502 this exists to abolish.
  assert.equal(backoffMs(1), 0);
  assert.equal(backoffMs(2), 500);
  assert.equal(backoffMs(3), 1_000);
  assert.equal(backoffMs(4), 2_000);
  // Capped: a boot loop must stay readable, not scroll a stack trace off screen.
  assert.equal(backoffMs(20), 5_000);
  for (let n = 1; n <= 30; n += 1) {
    assert.ok(backoffMs(n) <= 5_000, `backoff must never exceed the cap (n=${n})`);
    assert.ok(backoffMs(n) >= 0);
  }
  /* The second delay has to beat the EADDRINUSE race: on Windows a respawn can
   * reach listen() before the dying process has released :3000, and app.js
   * answers that with process.exit(1). Retrying FASTER would make that
   * permanent, which is the same class of bug as the one being fixed. */
  assert.ok(backoffMs(2) >= 250, 'the retry must be slower than the port-release race');
});

test('an editor scratch file is not a source change', () => {
  for (const yes of ['server.js', 'src/routes/trades.js', 'package.json', 'a/b/c.js']) {
    assert.equal(isSourceChange(yes), true, `${yes} should restart`);
  }
  /* Every one of these is written into a watched directory by an ordinary
   * editor save. Restarting on them is how a supervisor earns a reputation for
   * thrashing, and thrashing is why people turn supervisors off. */
  for (const no of ['.server.js.swp', '4913', 'server.js~', '.DS_Store', 'notes.md', '']) {
    assert.equal(isSourceChange(no), false, `${no} must not restart`);
  }
  assert.equal(isSourceChange(undefined), false, 'fs.watch may report a null filename');
  assert.equal(isSourceChange(null), false);
});

test('only an unsignalled non-zero exit counts as a crash', () => {
  // A signal means WE killed it — a reload, or Ctrl+C. Not a crash.
  assert.equal(classifyExit({ code: null, signal: 'SIGTERM', stopping: false }), 'restart');
  // Code 0 is app.js's shutdown handler doing its job. Respawning would make
  // the server unkillable, which is a worse bug than the one being fixed.
  assert.equal(classifyExit({ code: 0, signal: null, stopping: false }), 'stop');
  // Ctrl+C wins over everything, including a non-zero code on the way out.
  assert.equal(classifyExit({ code: 1, signal: null, stopping: true }), 'stop');
  assert.equal(classifyExit({ code: 0, signal: 'SIGINT', stopping: true }), 'stop');
  // And the case this whole file exists for.
  assert.equal(classifyExit({ code: 1, signal: null, stopping: false }), 'crash');
  assert.equal(classifyExit({ code: 7, signal: null, stopping: false }), 'crash');
});

/* ------------------------------------------------------------------ *
 * The integration pair. A temp dir, a fixture that dies on purpose.   *
 * ------------------------------------------------------------------ */

/* `async` + `await body(...)` is load-bearing. As a plain function this returns
 * the promise, the try block completes at once, and `finally` deletes the temp
 * directory before the body has done anything — so the marker file vanishes and
 * every assertion reads 0 boots, blaming the supervisor for a fault in the
 * harness. The supervisor was correct the whole time. */
async function withFixture(body, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvx-dev-'));
  /* .mjs, NOT .js — the temp dir has no package.json, so Node would read a bare
   * .js as CommonJS and the fixture's `import` would be a SyntaxError. It would
   * still "crash", so the restart assertions would pass while proving nothing:
   * the marker file would never be written and bootCount would sit at 0. */
  const script = path.join(dir, 'boom.mjs');
  // .txt so the supervisor's own watcher ignores it — isSourceChange() takes
  // only .js/.json, which is what keeps this fixture from restart-looping.
  const marker = path.join(dir, 'boots.txt');
  fs.writeFileSync(script, source(marker));
  try {
    return await body({ dir, script, marker });
  } finally {
    // Windows holds handles briefly after a kill; retry rather than fail the run.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/* Records one mark per boot, then dies the way an uncaught throw dies.
 *
 * NO NEWLINE IN THE MARK, deliberately. The obvious fixture appends 'boot\n'
 * and counts lines — but this string is written by a template literal INTO a
 * file that is then parsed as JavaScript, so the escape has to survive two
 * layers, and `\\n` collapsing one layer early puts a raw line break inside a
 * string literal. That is a SyntaxError, the fixture never runs, the marker
 * never appears, and all three integration tests fail with "0 boots" pointing
 * at the supervisor rather than at the fixture. Cost twenty minutes; the repo
 * has the same trap recorded for `\b` and `\s`. Counting a delimiter-free
 * token removes the escape instead of getting it right. */
const MARK = 'boot';
const CRASHER = (marker) => `
  import fs from 'node:fs';
  fs.appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(MARK)});
  setTimeout(() => { throw new Error('boom'); }, 150);
`;

const waitFor = async (fn, ms = 15_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

const bootCount = (marker) => (fs.existsSync(marker)
  ? fs.readFileSync(marker, 'utf8').split(MARK).length - 1
  : 0);

test('THE BUG: `node --watch` abandons a crashed process', async () => {
  /* The control. This is not testing our code — it is pinning the behaviour
   * that caused the outage, so that if a future Node changes it, this test says
   * so and the supervisor can be reconsidered rather than carried forever. */
  await withFixture(async ({ script, marker }) => {
    const p = spawn(process.execPath, ['--watch', script], { stdio: 'ignore' });
    try {
      await waitFor(() => bootCount(marker) >= 1, 10_000);
      // Give it far longer than any restart would take.
      await new Promise((r) => setTimeout(r, 3_000));
      assert.equal(bootCount(marker), 1,
        '--watch restarted a crashed process; if this ever passes, Node changed and scripts/dev.js may be redundant');
    } finally {
      p.kill('SIGKILL');
    }
  }, CRASHER);
});

test('THE FIX: the supervisor brings a crashed server back, and records why', async () => {
  await withFixture(async ({ dir, script, marker }) => {
    const crashLog = path.join(dir, 'crash.log');
    const p = spawn(process.execPath, [SUPERVISOR, script, dir], {
      stdio: 'ignore',
      env: { ...process.env, DEV_CRASH_LOG: crashLog },
    });
    try {
      // Three boots means it restarted twice — one recovery could be luck.
      const revived = await waitFor(() => bootCount(marker) >= 3, 20_000);
      assert.ok(revived, `the supervisor did not restart the crashed process (boots: ${bootCount(marker)})`);

      /* And the crash is on the record. Healing SILENTLY would be its own bug:
       * the recurring crash has never been reproduced on demand, the two usual
       * suspects are already handled (platform/db.js, platform/redis.js), and
       * this log is the only thing that will ever identify the real one. */
      assert.ok(fs.existsSync(crashLog), 'the crash was not recorded');
      const lines = fs.readFileSync(crashLog, 'utf8').trim().split('\n');
      assert.ok(lines.length >= 2, 'every crash gets a line, not just the first');
      assert.match(lines[0], /^\d{4}-\d\d-\d\dT[\d:.]+Z\s+exit=\d+\s+uptime=\d+ms$/,
        'a crash line must carry when, and with what exit code');
    } finally {
      p.kill('SIGKILL');
    }
  }, CRASHER);
});

test('a clean exit is a stop, not something to respawn', async () => {
  // Ctrl+C and app.js's shutdown both land here. Getting this wrong makes the
  // dev server unkillable — a worse bug than the one being fixed, so it is
  // proven end-to-end rather than only through classifyExit().
  await withFixture(async ({ dir, script, marker }) => {
    const p = spawn(process.execPath, [SUPERVISOR, script, dir], { stdio: 'ignore' });
    const exited = new Promise((r) => p.on('exit', r));
    try {
      await waitFor(() => bootCount(marker) >= 1, 10_000);
      assert.equal(await Promise.race([
        exited,
        new Promise((r) => setTimeout(() => r('still-running'), 4_000)),
      ]), 0, 'the supervisor must exit when its child exits cleanly');
      assert.equal(bootCount(marker), 1, 'a clean exit must not be respawned');
    } finally {
      p.kill('SIGKILL');
    }
  }, (marker) => `
    import fs from 'node:fs';
    fs.appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(MARK)});
    setTimeout(() => process.exit(0), 150);
  `);
});

/* ------------------------------------------------------------------ *
 * The other half: what the BROWSER says while the backend is down.    *
 * ------------------------------------------------------------------ */

test('a dead backend explains itself instead of saying "login 502"', () => {
  /* `Sign-in failed: login 502` is what the owner actually saw. It reads as an
   * auth bug and sends you into src/platform/auth/. The 502 is invented by the
   * Vite proxy, so the explanation belongs there — and because most of the ~35
   * call sites in lib/api.js are already `msg.error || <fallback>`, giving the
   * proxy's reply an `error` field fixes all of them without touching any. */
  const refused = proxyErrorMessage({ code: 'ECONNREFUSED' });
  assert.match(refused, /not running/i);
  assert.match(refused, /:3000/, 'name the port, so the reader knows which process');
  assert.match(refused, /npm run dev/, 'name the command — the reader is looking at a browser');

  // A restart under an in-flight request is a different answer: wait, do not go
  // start something that is already starting.
  for (const code of ['ECONNRESET', 'EPIPE']) {
    assert.match(proxyErrorMessage({ code }), /restart/i, `${code} should read as a restart`);
  }
  assert.match(proxyErrorMessage({ code: 'ETIMEDOUT' }), /did not respond/i);

  // An unrecognised failure must still carry its code — a generic "something
  // went wrong" would put us back where we started.
  assert.match(proxyErrorMessage({ code: 'EHOSTUNREACH' }), /EHOSTUNREACH/);
  assert.match(proxyErrorMessage({ message: 'socket hang up' }), /socket hang up/);
  assert.doesNotThrow(() => proxyErrorMessage(undefined), 'the handler must survive a null error');
});

test('the proxy handler answers with JSON, and never on a websocket socket', () => {
  const handlers = {};
  attachProxyErrorHandler({ on: (ev, fn) => { handlers[ev] = fn; } });
  assert.equal(typeof handlers.error, 'function', 'nothing was attached to the error event');

  let head = null; let body = null;
  handlers.error({ code: 'ECONNREFUSED' }, {}, {
    headersSent: false,
    writeHead: (status, hdrs) => { head = [status, hdrs]; },
    end: (b) => { body = b; },
  });
  assert.equal(head[0], 502);
  assert.match(head[1]['content-type'], /application\/json/);
  // The shape matters as much as the text: lib/api.js reads `.error`.
  assert.match(JSON.parse(body).error, /not running/i);

  /* A WebSocket upgrade hands the handler a bare Socket, which has no
     writeHead. Calling it would replace a readable proxy error with a
     TypeError thrown inside Vite. */
  assert.doesNotThrow(() => handlers.error({ code: 'ECONNREFUSED' }, {}, {}));
  assert.doesNotThrow(() => handlers.error({ code: 'ECONNREFUSED' }, {}, null));
  // And never write twice.
  let wrote = false;
  handlers.error({ code: 'ECONNREFUSED' }, {}, {
    headersSent: true,
    writeHead: () => { wrote = true; },
    end: () => { wrote = true; },
  });
  assert.equal(wrote, false, 'must not write to a response that already started');
});

test('the proxy handler is actually WIRED, not merely written', () => {
  /* The silent no-op this repo keeps re-learning: a correct helper that nothing
   * calls. Read as source rather than imported, because importing vite.config.js
   * pulls in the react and tailwind plugins for no benefit. */
  const cfg = fs.readFileSync(path.join(ROOT, 'frontend', 'vite.config.js'), 'utf8');
  assert.match(cfg, /import \{ attachProxyErrorHandler \} from '\.\/vite\.proxy-error\.js'/);
  assert.match(cfg, /'\/api':\s*\{[\s\S]{0,200}?configure: attachProxyErrorHandler/,
    'the /api proxy must install the error handler');
});

test('npm run dev is supervised, and says so', () => {
  /* The regression guard. Reverting `dev` to `node --watch src/server.js` is a
   * one-word edit that reintroduces hours of silent downtime and leaves no
   * trace anywhere else in the diff. */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.dev, 'node scripts/dev.js');
  assert.ok(!/--watch/.test(pkg.scripts.dev),
    '--watch cannot restart a crashed process — that is the bug this replaced');
  // Prod is pm2's job and must stay a bare node invocation.
  assert.equal(pkg.scripts.start, 'node src/server.js',
    'the supervisor is a dev tool; the box runs pm2');
  assert.ok(HEALTHY_AFTER_MS >= 5_000,
    'a server must run a while before its failure count resets, or a boot loop looks healthy');
});
