import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sweepStaleCompareTrees } from '../src/comparison.mjs';

function tree(tmp, name, { pid, ageMs = 0 } = {}) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, 'tree'), { recursive: true });
  if (pid !== undefined) fs.writeFileSync(path.join(dir, 'owner.pid'), String(pid));
  if (ageMs) { const t = (Date.now() - ageMs) / 1000; fs.utimesSync(dir, t, t); }
  return dir;
}

test('a compare tree whose owner died is removed, a live one is kept', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  try {
    const dead = tree(tmp, 'greenroom-compare-dead', { pid: 2 ** 22 + 12345 });
    const live = tree(tmp, 'greenroom-compare-live', { pid: process.pid });
    const oldUnowned = tree(tmp, 'greenroom-compare-old', { ageMs: 7 * 60 * 60 * 1000 });
    const freshUnowned = tree(tmp, 'greenroom-compare-new');
    const other = tree(tmp, 'something-else', { pid: 2 ** 22 + 12345 });
    const removed = sweepStaleCompareTrees(null, { tmp });
    assert.deepEqual(removed.sort(), [dead, oldUnowned].sort());
    for (const kept of [live, freshUnowned, other]) assert.ok(fs.existsSync(kept), kept);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
