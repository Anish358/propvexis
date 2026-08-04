import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Phase 3c split `frontend/src/styles.css` into `styles/tokens.css` (every design
// token) and `styles/legacy/app.css` (every component rule, verbatim). Their
// concatenation is byte-identical to the file that used to exist — the split was
// verified lossless — so tests that assert over "the stylesheet" read this and
// keep asserting over exactly the same CSS.
//
// `bridge.css` is not part of `appCss`, and the reason has narrowed since it was
// written. It still declares no values — it only maps our tokens into Tailwind's
// namespace — so a test asking "what does this app look like" reads tokens and
// components, not the mapping.
//
// But as of 2026-08-05 the mapping is load-bearing for appearance in a way it was not
// before. With the preset skin adopted (DESIGN-LANGUAGE, "the preset outranks legacy
// CSS"), a generated component asks for `rounded-2xl` and `shadow-lg` and the bridge is
// the only thing that makes those land on OUR scale instead of Tailwind's defaults. So
// it is exported separately: tests that assert on a preset-skinned surface must read it,
// and they should have to say so rather than getting it by accident in `appCss`.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

export const tokensCss = read('../../frontend/src/styles/tokens.css');
export const legacyCss = read('../../frontend/src/styles/legacy/app.css');
export const bridgeCss = read('../../frontend/src/styles/bridge.css');
export const appCss = tokensCss + legacyCss;
