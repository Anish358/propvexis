import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo-relative file locations, resolved ONCE and never by counting `..` from a
// caller's own directory.
//
// Why it works this way: the EA download route used to build its path as
// `../ea/PropVexis.mq5` relative to src/app.js. Moving that route into
// src/routes/ silently repointed it at src/ea/, and the handler — which turns a
// read failure into a 404 — reported the file as simply not there. No error, no
// failing test, just a download that stopped working. Depth arithmetic in a file
// that might move is a silent-failure generator.
//
// So the root is FOUND rather than assumed: walk up until package.json. That
// holds locally and on the box, where deploy rsyncs package.json alongside
// `src db scripts ea` into the app directory.
function findRepoRoot(fromUrl) {
  let dir = path.dirname(fileURLToPath(fromUrl));
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`could not locate the repo root above ${fileURLToPath(fromUrl)}`);
}

export const repoRoot = findRepoRoot(import.meta.url);

// The EA source the user downloads to attach in MT5. Served publicly on purpose:
// it contains no secrets (the ingest token is pasted in by the user).
export const eaSourceFile = path.join(repoRoot, 'ea', 'PropVexis.mq5');
