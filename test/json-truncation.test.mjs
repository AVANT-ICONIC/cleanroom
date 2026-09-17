import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempRepo, put } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../src/cli.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [cli, ...args, `--root=${root}`], { encoding: 'utf8' });

/**
 * A repository with enough violations that `check --json` exceeds the OS pipe
 * buffer (64KiB on macOS). Any consumer reading our stdout must get the whole
 * document, not the first buffer's worth.
 */
function bigBrownfieldRepo() {
  const root = tempRepo();
  assert.equal(run(root, 'init', '--existing').status, 0);
  put(root, 'src/index.ts', 'export const ok = true;\n');
  assert.equal(run(root, 'baseline').status, 0);
  for (let i = 0; i < 60; i++) {
    put(root, `src/mod-fix-v${i}.ts`, `export const v${i} = ${i};\n`);
  }
  return root;
}

/** Read the child's stdout slowly, the way a busy consumer would. */
function runWithSlowReader(root) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'check', '--json', `--root=${root}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    child.stdout.pause();
    setTimeout(() => {
      const until = Date.now() + 500;
      while (Date.now() < until) { /* block, like a loaded event loop */ }
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stdout.resume();
    }, 50);
    child.on('close', (code) => setTimeout(() => resolve({ code, stdout }), 100));
  });
}

test('large --json output survives a slow consumer', async () => {
  const root = bigBrownfieldRepo();
  const { code, stdout } = await runWithSlowReader(root);

  assert.equal(code, 1, 'new violations should block');
  assert.ok(stdout.length > 65536, `expected more than one pipe buffer, got ${stdout.length} bytes`);

  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(stdout); }, 'stdout must be a complete JSON document');
  assert.ok(parsed.fresh.length >= 60, `expected the fresh violations, got ${parsed.fresh.length}`);
});
