import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Phase 3c split `frontend/src/styles.css` into `styles/tokens.css` (every design
// token) and `styles/legacy/app.css` (every component rule, verbatim). Their
// concatenation is byte-identical to the file that used to exist — the split was
// verified lossless — so tests that assert over "the stylesheet" read this and
// keep asserting over exactly the same CSS.
//
// `bridge.css` is deliberately NOT included: it declares no values, only maps our
// tokens into Tailwind's namespace. A test asking "what does this app look like"
// is asking about tokens and components, not about the mapping.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

export const tokensCss = read('../../frontend/src/styles/tokens.css');
export const legacyCss = read('../../frontend/src/styles/legacy/app.css');
export const appCss = tokensCss + legacyCss;
