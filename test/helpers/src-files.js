import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// frontend/src was flat until the feature-folder restructure; a page now lives at
// `features/<domain>/Page.jsx` instead of `Page.jsx`. Several tests read source by
// path and scan the source directory, and both break on a move — a hardcoded path
// loudly, a `readdirSync(srcDir)` scan SILENTLY (it keeps passing over the three
// files still at the root and stops seeing the app).
//
// So the location of a file stops being any test's business. Tests that care about
// composition ("Dashboard renders KpiCards") name the file; this resolves it. Tests
// that sweep the app ask for the file list and get one that follows the tree.
export const srcDir = fileURLToPath(new URL('../../frontend/src', import.meta.url));

const walk = (dir, base = '') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(dir, e.name), base ? `${base}/${e.name}` : e.name)
      : [base ? `${base}/${e.name}` : e.name]);

/** Every file under frontend/src, as paths relative to it. */
export const allSrcFiles = () => walk(srcDir);

// The component library is generated / hand-written UI plumbing, not application
// code, and the app-wide sweeps deliberately excluded it before the restructure by
// virtue of scanning only the flat root. Keep that boundary explicit now that the
// scans are recursive, or every sweep starts reporting shadcn's own markup.
const LIBRARY = /^components\/(ui|primitives)\//;

/** Application source files (pages, features, shell, libs) — excludes the
 *  generated/primitive component library under components/{ui,primitives}. */
export function appFiles({ ext = /\.jsx?$/ } = {}) {
  return allSrcFiles().filter((f) => ext.test(f) && !LIBRARY.test(f));
}

/** Application .jsx files only. */
export const appJsx = () => appFiles({ ext: /\.jsx$/ });

const index = new Map();
for (const rel of walk(srcDir)) {
  const name = path.basename(rel);
  index.set(name, index.has(name) ? null : rel);   // null marks an ambiguous name
}

/** Resolve a source file by basename OR by path relative to frontend/src. Throws
 *  rather than returning nothing, so a renamed file fails loudly here instead of
 *  quietly dropping the assertion that depended on it. */
export function resolveSrc(nameOrRel) {
  const direct = index.get(nameOrRel) ?? null;
  if (direct) return direct;
  if (index.has(nameOrRel) && direct === null) {
    throw new Error(`'${nameOrRel}' is ambiguous under frontend/src — pass a relative path`);
  }
  if (allSrcFiles().includes(nameOrRel)) return nameOrRel;
  throw new Error(`no such file under frontend/src: '${nameOrRel}'`);
}

/** Read a source file by basename or relative path. */
export const readSrc = (nameOrRel) =>
  readFileSync(path.join(srcDir, resolveSrc(nameOrRel)), 'utf8');

/** Does a file with this basename exist ANYWHERE under frontend/src? For asserting
 *  a deleted file stayed deleted: a path-based `!existsSync` check silently starts
 *  passing once the tree is reorganised, because it now points at a location the
 *  file would never have been re-created in. */
export const srcExists = (name) => {
  const hit = index.get(name);
  return hit !== undefined || allSrcFiles().includes(name);
};

/* Source with comments removed, for assertions about CODE rather than about prose.
 *
 * WHY THIS EXISTS. Every frontend test in this repo asserts over source as text (no
 * jsdom, by decision), and a comment explaining a rule necessarily contains the words
 * the rule is about. That has already produced two false results: a test pinning that
 * a dispatch precedes `await file.text()` found the sentence explaining the ordering
 * instead of the call, and a test asserting the wizard never touches `localStorage`
 * matched the comment saying it uses sessionStorage rather than localStorage. Both
 * were the assertion reading documentation as implementation.
 *
 * So: assert over `readCode()` when the claim is about what the code DOES, and over
 * `readSrc()` when the claim is about the file as written (a required comment, a
 * citation, a task marker).
 *
 * KNOWN LIMIT, recorded rather than hidden: this tracks string literals (with their
 * escapes) but NOT regex literals, so a regex containing `//` — `/https:\/\//` — would
 * be read as the start of a line comment and over-strip the rest of the line. No
 * frontend source file has one today. A caller that needs one should assert over
 * readSrc() and scope the slice itself.
 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;               // the delimiter we are inside, or null
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === '\\') { out += c + (next ?? ''); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i += 1; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;                   // the newline itself is kept by the next iteration
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';   // keep line numbers roughly honest
        i += 1;
      }
      i += 2;
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

/** Read a source file by basename or relative path, comments stripped. */
export const readCode = (nameOrRel) => stripComments(readSrc(nameOrRel));
