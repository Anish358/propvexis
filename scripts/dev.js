// The local dev supervisor. `npm run dev` runs THIS, not `node --watch`.
//
// WHY THIS FILE EXISTS
// --------------------
// Prod is supervised: pm2 restarts the backend the moment it dies. Dev was not,
// and that asymmetry produced a bug that wasted real time on 2026-09-11 and had
// been recurring for weeks before that.
//
// `node --watch src/server.js` restarts the server when a file it IMPORTED
// changes. It does NOT restart it when the process dies. On a crash it prints
//
//     Failed running 'src/server.js'. Waiting for file changes before restarting...
//
// exactly once, and then sits there — alive, holding the terminal, looking for
// all the world like a running dev server. The only file change that would
// revive it is a change to a BACKEND file, and during a design session every
// edit is under `frontend/`. So the backend stays dead for hours.
//
// What the owner sees is not "the backend crashed". It is the login page saying
// `Sign-in failed: login 502` — because Vite proxies /api to :3000, the
// connection is refused, and Vite answers 502. That reads as an auth bug and
// sends you into src/platform/auth/, which is the wrong place entirely. It is
// documented as a trap in the auto-memory for exactly that reason.
//
// So: give dev the same supervision prod already has. Three jobs, in order of
// how much each one matters:
//
//   1. RESTART ON CRASH. The bug above, gone. A dead backend is now a
//      self-healing backend.
//   2. RECORD THE CRASH. Append it to dev-crash.log with a timestamp and exit
//      code. We still do not know what the recurring crash actually IS — the
//      two classic causes are already handled (an idle pg client dying is
//      caught in platform/db.js, a redis error in platform/redis.js) and
//      nothing reproduces on demand. A supervisor that heals silently would
//      guarantee we never find out. This file is the evidence trail.
//   3. RESTART ON EDIT, which is the one thing `--watch` was here for.
//
// NOT A PROD PATH. `npm start` is still a bare `node src/server.js` and pm2 is
// still the supervisor on the box. Nothing here ships.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Restart delay after a crash, by consecutive-failure count.
 *
 * The first restart is IMMEDIATE: the overwhelmingly common case is one bad
 * request or one dropped connection, and waiting half a second to recover from
 * it is half a second of the 502 this file exists to abolish.
 *
 * After that it backs off, because a crash that repeats is a crash at BOOT, and
 * booting in a tight loop turns a readable stack trace into a wall of scroll.
 * EADDRINUSE is the specific case worth naming — on Windows a respawn can beat
 * the dying process to releasing :3000, and the retry needs to be slower than
 * that race, not faster.
 *
 * Exported and pure so the policy is testable without spawning anything. */
export function backoffMs(consecutiveFailures) {
  if (consecutiveFailures <= 1) return 0;
  return Math.min(500 * 2 ** (consecutiveFailures - 2), 5_000);
}

/* How long a child must survive before we call it healthy and forget its
 * ancestors' failures. Under this, a server that runs fine for an hour and then
 * dies once would inherit the backoff from a boot loop earlier in the session. */
export const HEALTHY_AFTER_MS = 10_000;

/* Which file changes are worth a restart.
 *
 * `--watch` watched the imported module graph, so it saw .js and nothing else.
 * This watches a DIRECTORY, which means it also sees editor scratch files,
 * Vim's `4913`, `.swp`, and the atomic-save temp files every editor writes next
 * to the real one. Restarting on those is how a supervisor earns a reputation
 * for thrashing. .json counts because config and fixtures load at boot. */
export function isSourceChange(filename) {
  if (!filename) return false;
  const base = path.basename(filename);
  if (base.startsWith('.') || base.endsWith('~')) return false;
  if (/^\d+$/.test(base)) return false; // Vim's atomic-save probe file
  return /\.(js|json)$/.test(base);
}

/* Decide what to do when the child exits. Pure, because the interesting part is
 * the classification and the interesting part should be testable.
 *
 * `signal` is set when WE killed it (a restart, or Ctrl+C). A null signal with a
 * non-zero code is the process dying on its own — the case this file is for.
 * Code 0 with no signal is a clean exit, which in a server means someone called
 * process.exit(0): the shutdown handler in app.js, i.e. a deliberate stop. */
export function classifyExit({ code, signal, stopping }) {
  if (stopping) return 'stop';
  if (signal) return 'restart';
  if (code === 0) return 'stop';
  return 'crash';
}

// ---------------------------------------------------------------------------
// The supervisor itself. Everything above is pure; everything below is I/O.

// All three are overridable so the supervisor can be pointed at a fixture and
// its own crash log inspected — see test/dev-supervisor.test.js. Defaults are
// the only thing `npm run dev` ever uses.
const entry = process.argv[2] ?? path.join('src', 'server.js');
const watchDir = process.argv[3] ?? path.join(ROOT, 'src');
const crashLog = process.env.DEV_CRASH_LOG ?? path.join(ROOT, 'dev-crash.log');

let child = null;
let stopping = false;
let failures = 0;
let startedAt = 0;
let restartTimer = null;

function log(msg) {
  process.stderr.write(`[dev] ${msg}\n`);
}

/* The crash record. Written to a file rather than only to the terminal because
 * the terminal is precisely where this was being missed: the stack scrolls away
 * behind Vite's output and the next thing anyone reads is a 502 in the browser.
 * dev-crash.log is covered by the existing `*.log` line in .gitignore. */
function recordCrash(code) {
  const line = `${new Date().toISOString()}  exit=${code}  uptime=${Date.now() - startedAt}ms\n`;
  try {
    fs.appendFileSync(crashLog, line);
  } catch {
    /* A supervisor that cannot write its own log still has one job: supervise.
       Never let bookkeeping be the thing that stops the restart. */
  }
}

function start() {
  startedAt = Date.now();
  child = spawn(process.execPath, [entry], { cwd: ROOT, stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    child = null;
    const what = classifyExit({ code, signal, stopping });

    if (what === 'stop') {
      process.exit(code ?? 0);
    }
    if (what === 'restart') {
      start();
      return;
    }

    // A crash. Say so unmissably — this is the message whose absence sent
    // everyone hunting through the auth layer.
    if (Date.now() - startedAt > HEALTHY_AFTER_MS) failures = 0;
    failures += 1;
    recordCrash(code);
    const wait = backoffMs(failures);
    log(`SERVER CRASHED (exit ${code}). Restarting${wait ? ` in ${wait}ms` : ''}… `
      + `[#${failures}, logged to dev-crash.log]`);
    restartTimer = setTimeout(start, wait);
    restartTimer.unref?.();
  });
}

function restart(reason) {
  if (stopping) return;
  clearTimeout(restartTimer);
  failures = 0; // an edit is not a failure, and must not inherit a backoff
  log(`restarting — ${reason}`);
  if (child) child.kill('SIGTERM'); // the 'exit' handler respawns
  else start();
}

/* One recursive watcher on src/, debounced. Debouncing is not a nicety: a single
 * editor save fires `change` two or three times, and a git checkout fires it
 * once per file — without this, switching branches would restart the server
 * dozens of times. */
let debounce = null;
function watch() {
  try {
    fs.watch(watchDir, { recursive: true }, (_event, filename) => {
      if (!isSourceChange(filename)) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => restart(`${path.basename(filename)} changed`), 120);
    });
  } catch (err) {
    // Recursive watch is supported on Windows and macOS and, since Node 20, on
    // Linux. If it ever is not, losing reload-on-edit is survivable; losing
    // restart-on-crash is the thing that must not happen, so carry on.
    log(`file watching unavailable (${err.message}) — crash-restart still active`);
  }
}

/* RUN ONLY WHEN RUN, not when imported. test/dev-supervisor.test.js imports this
 * file for the three pure functions above; without this guard that import would
 * spawn a second backend on :3000 in the middle of the suite and then supervise
 * it forever, which is a memorable way to hang CI. */
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      stopping = true;
      clearTimeout(restartTimer);
      if (child) child.kill(sig);
      else process.exit(0);
    });
  }

  start();
  watch();
}
