import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// V8 sizes the young generation when the process starts; setting it later from
// inside the CLI changes nothing (measured). So the flag lives in the shebang,
// which npm's shims (cmd-shim parses `env -S`) carry to every installed caller.
const cli = new URL('../src/cli.mjs', import.meta.url);

test('the CLI shebang starts node with a 4 MB semi-space', () => {
  const first = fs.readFileSync(cli, 'utf8').split('\n', 1)[0];
  assert.equal(first, '#!/usr/bin/env -S node --max-semi-space-size=4');
});

test('this node accepts the flag the shebang passes', () => {
  const r = spawnSync(process.execPath, ['--max-semi-space-size=4', '-e', 'process.exit(0)']);
  assert.equal(r.status, 0, String(r.stderr));
});
