import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeDuplicates } from '../src/analyzers/duplicates.mjs';

// The block index stores a window as one offset into all indexed lines laid end
// to end. Files of different lengths, a copy at different starts and a file in
// between with no copy must still report each file's own 1-based start line.
const block = Array.from({ length: 8 }, (_, i) => `const value${i} = computeSomethingLong(alpha${i}, beta${i}, gamma${i});`);
const filler = (n, tag) => Array.from({ length: n }, (_, i) => `let ${tag}${i} = unrelated${tag}(${i});`);

test('a block copied at different starts reports each file at its own line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-dup-'));
  const write = (rel, lines) => { fs.writeFileSync(path.join(dir, rel), lines.join('\n')); return { abs: path.join(dir, rel), rel, ext: '.js' }; };
  const files = [
    write('a.js', [...filler(2, 'a'), ...block, ...filler(3, 'aa')]),
    write('b.js', filler(40, 'b')),
    write('c.js', [...filler(9, 'c'), ...block]),
  ];
  const config = { rules: { duplicateFiles: false, duplicateBlocks: true }, duplicateBlocks: { minLines: 8 } };
  const out = analyzeDuplicates(files, config);
  assert.equal(out.length, 1);
  assert.match(JSON.stringify(out[0]), /a\.js:3, c\.js:10/);
  fs.rmSync(dir, { recursive: true, force: true });
});
