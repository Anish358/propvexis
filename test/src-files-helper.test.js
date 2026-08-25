import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripComments } from './helpers/src-files.js';

// stripComments backs readCode(), which every source-text assertion about CODE should
// read through. Its whole reason for existing is that a comment explaining a rule
// contains the words the rule is about, so these are the cases that matter.

test('line and block comments are removed', () => {
  assert.equal(stripComments('a // localStorage\nb').trim(), 'a \nb');
  assert.equal(stripComments('a /* <Layout> */ b'), 'a  b');
});

test('a comment cannot satisfy an assertion about code', () => {
  // The two false results that prompted this helper, as tests.
  const shell = `// sessionStorage, not localStorage: the draft dies with the tab\nsessionStorage.getItem(k);`;
  assert.equal(/localStorage/.test(shell), true, 'the raw source does contain the word');
  assert.equal(/localStorage/.test(stripComments(shell)), false, 'the code does not');

  const handler = `// cleared before \`await file.text()\`\ndispatch(x);\nconst t = await file.text();`;
  assert.ok(stripComments(handler).indexOf('dispatch(x)') < stripComments(handler).indexOf('await file.text()'));
});

test('strings that look like comments survive', () => {
  assert.equal(stripComments(`const u = 'https://x.com//y';`), `const u = 'https://x.com//y';`);
  assert.equal(stripComments('const s = "a /* b */ c";'), 'const s = "a /* b */ c";');
  assert.equal(stripComments('const s = `t // pl`;'), 'const s = `t // pl`;');
});

test('escapes inside strings do not end the string early', () => {
  assert.equal(stripComments(`const s = 'it\\'s // fine'; // gone`).trim(), `const s = 'it\\'s // fine';`);
});

test('block comments keep their newlines, so line numbers stay roughly honest', () => {
  assert.equal(stripComments('a\n/* x\ny\nz */\nb').split('\n').length, 5);
});
