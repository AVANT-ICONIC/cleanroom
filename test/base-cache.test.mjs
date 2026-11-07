import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkerHash, readBaseScan, writeBaseScan, cacheDir } from '../src/base-cache.mjs';

// MEASURED 2026-11-07 on apex-nexus: greenroom check took 38-42 s wall and 36-40
// CPU-s; with the base scan answered once per tree it took 12 s and 12 CPU-s, and
// the JSON verdict (fresh, resolved, waived, label, exit code) was identical.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gr-cache-'));
const TREE = 'a'.repeat(40);

test('a base scan written for a tree is read back for that tree only', () => {
  const dir = tmp();
  writeBaseScan(TREE, { violations: [{ id: 'x', rule: 'r' }] }, { dir });
  assert.deepEqual(readBaseScan(TREE, { dir }), { hit: true, value: { violations: [{ id: 'x', rule: 'r' }] } });
  assert.deepEqual(readBaseScan('b'.repeat(40), { dir }), { hit: false }, 'another tree is a miss');
});

test('a base with no baseline is remembered as none, not as zero violations', () => {
  const dir = tmp();
  writeBaseScan(TREE, { none: true }, { dir });
  assert.deepEqual(readBaseScan(TREE, { dir }), { hit: true, value: { none: true } });
});

test('a malformed or foreign entry is a miss, never a verdict', () => {
  const dir = tmp();
  writeBaseScan(TREE, { violations: [] }, { dir });
  const [file] = fs.readdirSync(dir);
  fs.writeFileSync(path.join(dir, file), '{not json');
  assert.deepEqual(readBaseScan(TREE, { dir }), { hit: false });
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ tree: TREE, checker: 'someone-else', violations: [] }));
  assert.deepEqual(readBaseScan(TREE, { dir }), { hit: false }, 'an entry from another checker build is not read');
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ tree: TREE, checker: checkerHash(), violations: 'nope' }));
  assert.deepEqual(readBaseScan(TREE, { dir }), { hit: false });
});

test('no tree or a disabled cache reads and writes nothing', () => {
  const dir = tmp();
  writeBaseScan(null, { violations: [] }, { dir });
  assert.equal(fs.readdirSync(dir).length, 0);
  assert.deepEqual(readBaseScan(null, { dir }), { hit: false });
  assert.equal(cacheDir({ GREENROOM_CACHE: '0' }), null);
  assert.equal(cacheDir({ GREENROOM_CACHE_DIR: '/x' }), '/x');
});

test('the checker hash covers the package source', () => {
  assert.match(checkerHash(), /^[0-9a-f]{64}$/);
});
