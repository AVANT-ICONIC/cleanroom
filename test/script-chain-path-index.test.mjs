// The indexed mention test must agree with the original scan on every input.
// Perf change, 2026-11-12: the scripts analyzer no longer rescans each file per
// target. This pins the equivalence on random texts, so a future edit cannot
// quietly change which script chains are reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionsPath, mentionsIndexed, pathRunIndex } from '../src/analyzers/scripts.mjs';

const ALPHABET = 'ab./-_ x\n.';
function prng(seed) {
  let state = seed;
  return (n) => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state % n; };
}

test('indexed and scanned mention tests agree on 20000 random texts and candidates', () => {
  const rnd = prng(7);
  const pick = (n) => Array.from({ length: n }, () => ALPHABET[rnd(ALPHABET.length)]).join('');
  for (let i = 0; i < 20000; i++) {
    const text = pick(1 + rnd(60));
    const candidate = pick(1 + rnd(6));
    assert.equal(mentionsIndexed(text, pathRunIndex(text), candidate), mentionsPath(text, candidate), JSON.stringify({ text, candidate }));
  }
});

test('a path named inside a longer path is not a mention of the shorter one', () => {
  const text = "require('packages/runtime/src/worker.mjs')";
  assert.equal(mentionsIndexed(text, pathRunIndex(text), 'worker.mjs'), false);
  assert.equal(mentionsIndexed(text, pathRunIndex(text), 'packages/runtime/src/worker.mjs'), true);
});
