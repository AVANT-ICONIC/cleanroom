import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempRepo, put } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '../src/cli.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [cli, ...args, `--root=${root}`], { encoding: 'utf8' });

/**
 * OpenSpec requires a plain YYYY-MM-DD `created` date. A full ISO timestamp
 * makes the metadata invalid, which silently disables the `skip_specs` marker
 * and makes every generated cleanup change fail validation.
 */
test('exported OpenSpec changes carry a date OpenSpec accepts', () => {
  const root = tempRepo();
  assert.equal(run(root, 'init', '--existing').status, 0);
  put(root, 'src/thing.ts', 'export const a = 1;\n');
  put(root, 'src/thing-copy.ts', 'export const a = 1;\n');
  assert.equal(run(root, 'baseline').status, 0);
  fs.mkdirSync(path.join(root, 'openspec', 'changes'), { recursive: true });

  const plan = run(root, 'cleanup', 'plan', '--json');
  assert.equal(plan.status, 0);
  const campaignId = JSON.parse(plan.stdout).phases[0]?.batches[0]?.id;
  assert.ok(campaignId, 'expected the plan to produce a campaign');

  // --no-validate so the assertion is about our own output, not the CLI being installed.
  const exported = run(root, 'cleanup', 'openspec', campaignId, '--no-validate');
  assert.equal(exported.status, 0, exported.stderr);

  const metadataPath = path.join(root, 'openspec', 'changes', `greenroom-${campaignId}`, '.openspec.yaml');
  const metadata = fs.readFileSync(metadataPath, 'utf8');

  assert.match(metadata, /^created: \d{4}-\d{2}-\d{2}$/m, `created must be YYYY-MM-DD, got:\n${metadata}`);
  assert.match(metadata, /^schema: spec-driven$/m);
  assert.match(metadata, /^skip_specs: true$/m);
});
