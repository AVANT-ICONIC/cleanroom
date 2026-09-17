import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempRepo, put } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../src/cli.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [cli, ...args, `--root=${root}`], { encoding: 'utf8' });

test('CLI baseline/check blocks a newly introduced violation', () => {
  const root = tempRepo();
  assert.equal(run(root, 'init', '--existing').status, 0);
  put(root, 'src/index.ts', 'export const ok = true;\n');
  assert.equal(run(root, 'baseline').status, 0);
  put(root, 'src/thing-final.ts', 'export const nope = true;\n');
  const result = run(root, 'check');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /BLOCKED/);
});


test('existing baseline cannot be replaced without force and an audit reason', () => {
  const root = tempRepo();
  assert.equal(run(root, 'init', '--existing').status, 0);
  put(root, 'src/index.ts', 'export const ok = true;\n');
  assert.equal(run(root, 'baseline').status, 0);

  const governanceEnv = { ...process.env, GREENROOM_ALLOW_GOVERNANCE_UPDATE: '1' };
  const noForce = spawnSync(process.execPath, [cli, 'baseline', `--root=${root}`], { encoding: 'utf8', env: governanceEnv });
  assert.equal(noForce.status, 2);
  assert.match(noForce.stderr, /--force/);

  const noReason = spawnSync(process.execPath, [cli, 'baseline', '--force', `--root=${root}`], { encoding: 'utf8', env: governanceEnv });
  assert.equal(noReason.status, 2);
  assert.match(noReason.stderr, /--reason/);

  const approved = spawnSync(process.execPath, [cli, 'baseline', '--force', '--reason=approved policy update', `--root=${root}`], { encoding: 'utf8', env: governanceEnv });
  assert.equal(approved.status, 0);
});


test('CLI exports a cleanup campaign into an existing OpenSpec project', () => {
  const root = tempRepo();
  assert.equal(run(root, 'init', '--existing').status, 0);
  put(root, 'src/index.ts', 'export const root = true;\n');
  put(root, 'scripts/provider-state.ts', 'export const providerState = 1;\n');
  put(root, 'scripts/fix-provider-state.ts', 'export const fixProviderState = 2;\n');
  assert.equal(run(root, 'clean').status, 0);
  const plan = JSON.parse(fs.readFileSync(path.join(root, '.greenroom/cleanup-plan.json'), 'utf8'));
  const id = plan.phases.flatMap((phase) => phase.batches)[0]?.id;
  assert.ok(id);
  fs.mkdirSync(path.join(root, 'openspec', 'changes'), { recursive: true });
  const exported = run(root, 'cleanup', 'openspec', id, '--name=cleanup-provider-state', '--no-validate');
  assert.equal(exported.status, 0, exported.stderr);
  assert.match(exported.stdout, /OpenSpec cleanup change created/);
  assert.ok(fs.existsSync(path.join(root, 'openspec/changes/cleanup-provider-state/tasks.md')));
});
