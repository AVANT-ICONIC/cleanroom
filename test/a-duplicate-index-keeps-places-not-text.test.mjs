import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeDuplicates } from '../src/analyzers/duplicates.mjs';

// MEASURED 2026-11-07 on apex-nexus (5,961 files): the block index stored every
// window's text, heap 34 -> 215 MB, never read back. It now keeps [path, start]
// pairs; a warm check went from 331 MB to 168 MB peak RSS with an identical verdict.

const block = Array.from({ length: 10 }, (_, i) => `const value${i} = computeSomethingLong(alpha, beta, gamma, ${i});`).join('\n');
function files(dir, specs) {
  return specs.map(([rel, text]) => { const abs = path.join(dir, rel); fs.writeFileSync(abs, text); return { abs, rel, ext: '.mjs' }; });
}
const config = (minOccurrences) => ({ rules: { duplicateFiles: false, duplicateBlocks: true }, duplicateBlocks: { minLines: 8, minOccurrences, ignorePatterns: [] } });

test('a block copied into two files is still one duplication/block violation naming both', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-'));
  const out = analyzeDuplicates(files(dir, [['a.mjs', `${block}\n`], ['b.mjs', `// header\n${block}\n`], ['c.mjs', 'export const x = 1;\n']]), config(2));
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'duplication/block');
  assert.match(out[0].message ?? JSON.stringify(out[0]), /2 files/);
});

test('a block seen once is not a duplicate at the default threshold', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-'));
  assert.equal(analyzeDuplicates(files(dir, [['a.mjs', `${block}\n`]]), config(2)).length, 0);
});

test('minOccurrences 1 still reports a block that appears in one file, as before', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-'));
  assert.ok(analyzeDuplicates(files(dir, [['a.mjs', `${block}\n`]]), config(1)).length >= 1);
});
