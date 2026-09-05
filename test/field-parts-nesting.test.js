import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appJsx, readCode } from './helpers/src-files.js';

/* A Base UI Field PART outside its Field ROOT throws at RENDER TIME and takes the
 * whole page down — the user sees "Something went wrong. Please refresh the page."
 * and a minified `Base UI error #28` in the console, with no clue which component
 * did it.
 *
 * THIS SHIPPED. The cTrader authorize step rendered <FieldDescription> directly
 * inside a <WizardGroup> to show the platform's credential note. Every test
 * passed, lint passed, the bundle built, and the page crashed the moment it was
 * opened — because nothing in CI renders a DOM. Reproduced in the local browser
 * harness before writing this: bare throws, wrapped renders.
 *
 * So the guard is structural and static: a Field part must have a Field root open
 * above it in the same file. */
const PARTS = ['FieldDescription', 'FieldError', 'FieldLabel'];

const offences = (src) => {
  const found = [];
  let depth = 0;
  src.split('\n').forEach((line, idx) => {
    // <Field> but not <FieldLabel> etc.
    const opens = (line.match(/<Field(?![A-Za-z])/g) || []).length;
    const selfClosing = (line.match(/<Field(?![A-Za-z])[^>]*\/>/g) || []).length;
    const closes = (line.match(/<\/Field>/g) || []).length;
    for (const part of PARTS) {
      if (new RegExp(`<${part}\\b`).test(line) && depth + opens - selfClosing <= 0) {
        found.push(`${part} at line ${idx + 1}`);
      }
    }
    depth += opens - selfClosing - closes;
  });
  return found;
};

test('no Field part is rendered outside a Field root', () => {
  const bad = [];
  for (const file of appJsx()) {
    for (const o of offences(readCode(file))) bad.push(`${file}: ${o}`);
  }
  assert.deepEqual(bad, [],
    `these throw Base UI error #28 and crash the page at render:\n  ${bad.join('\n  ')}`);
});

test('the detector actually detects — it is not vacuously green', () => {
  // A guard that cannot fail is worse than no guard, because it reads as coverage.
  assert.deepEqual(
    offences('<WizardGroup>\n  <FieldDescription>x</FieldDescription>\n</WizardGroup>'),
    ['FieldDescription at line 2'],
  );
  assert.deepEqual(
    offences('<Field>\n  <FieldDescription>x</FieldDescription>\n</Field>'),
    [],
  );
  // A self-closing <Field /> opens no scope for the next line.
  assert.deepEqual(
    offences('<Field />\n<FieldDescription>x</FieldDescription>'),
    ['FieldDescription at line 2'],
  );
  // FieldLabel must not be mistaken for a Field root by the opening regex.
  assert.deepEqual(
    offences('<FieldLabel>x</FieldLabel>'),
    ['FieldLabel at line 1'],
  );
});
