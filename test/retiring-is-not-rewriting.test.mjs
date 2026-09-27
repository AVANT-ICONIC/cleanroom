import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempRepo, put } from './helpers.mjs';
import { classifyRegistryDiff } from '../src/registry-diff.mjs';
import { integrityViolations, registryHash } from '../src/integrity.mjs';
import { loadConfig } from '../src/config.mjs';
import { tombstonedPaths } from '../src/tombstones.mjs';

// DELETING A DEAD MODULE IS NOT AN ARCHITECTURE REWRITE.
//
// MEASURED 2026-09-27 in apex-nexus #1778: six modules nothing called were
// deleted and their six registry entries retired. Keeping the entries would
// point the registry at deleted files; removing them raised
// policy/registry-changed on both the branch path and the baseline-hash path,
// and only GREENROOM_ALLOW_GOVERNANCE_UPDATE=1 passed it.
//
// A removal is a retirement when every canonical path the entry claimed is
// ABSENT from the tree AND tombstoned. Anything less is still a mutation.

function git(root, ...args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

const REG = '.greenroom/registry.json';
const write = (root, value) => put(root, REG, JSON.stringify(value, null, 2) + '\n');
const tombstone = (root, rel) =>
  put(root, `.greenroom/tombstones/path--${rel.replace(/\//g, '_')}.json`,
    JSON.stringify({ path: rel, replacedBy: 'nothing', reason: 'no caller', commit: 'abc' }, null, 2));

const TWO = {
  version: 1,
  responsibilities: { alpha: { canonical: 'src/a.js' }, beta: { canonical: 'src/b.js', owner: 'apex' } },
  components: {}
};
const ALPHA_ONLY = { version: 1, responsibilities: { alpha: { canonical: 'src/a.js' } }, components: {} };

/** A real repository with a real base branch, because this feature IS git. */
function repoOnBase(baseRegistry) {
  const root = tempRepo();
  git(root, 'init', '-q', '-b', 'master');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'test');
  put(root, '.greenroom.json', JSON.stringify({ version: 1, registryFile: REG }, null, 2));
  put(root, 'src/a.js', 'export const a = 1;\n');
  put(root, 'src/b.js', 'export const b = 1;\n');
  write(root, baseRegistry);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  return root;
}

/** Both registry checks, told apart by their messages. */
function registryChecks(root, baseline) {
  const found = integrityViolations(root, loadConfig(root), baseline, { compareRef: 'master' })
    .filter((v) => v.rule === 'policy/registry-changed');
  return {
    branch: found.some((v) => /differs from master/.test(v.message)),
    hash: found.some((v) => /after baseline/.test(v.message))
  };
}

function retireBeta({ deleteFile = true, tombstoneIt = true } = {}) {
  const root = repoOnBase(TWO);
  const baseline = { registryHash: registryHash(root, loadConfig(root)) };
  if (deleteFile) fs.rmSync(path.join(root, 'src/b.js'));
  if (tombstoneIt) tombstone(root, 'src/b.js');
  write(root, ALPHA_ONLY);
  assert.notEqual(registryHash(root, loadConfig(root)), baseline.registryHash, 'the hash really did move');
  return { root, baseline };
}

// ---------------------------------------------------------------------------
// The classifier, on its own.

test('a removed entry the caller vouches for is a retirement, not a mutation', () => {
  const d = classifyRegistryDiff(JSON.stringify(TWO), JSON.stringify(ALPHA_ONLY), { isRetired: (p) => p === 'src/b.js' });
  assert.equal(d.kind, 'retiring');
  assert.deepEqual(d.retired, ['responsibilities.beta']);
  assert.deepEqual(d.removed, []);
});

test('with no judgement supplied, a removal is still a mutation', () => {
  const d = classifyRegistryDiff(JSON.stringify(TWO), JSON.stringify(ALPHA_ONLY));
  assert.equal(d.kind, 'mutating');
  assert.deepEqual(d.removed, ['responsibilities.beta']);
});

test('an entry is retired only when EVERY canonical it claimed is', () => {
  const both = { version: 1, responsibilities: { beta: { canonical: ['src/b.js', 'src/c.js'] } }, components: {} };
  const d = classifyRegistryDiff(JSON.stringify(both), JSON.stringify({ ...both, responsibilities: {} }),
    { isRetired: (p) => p === 'src/b.js' });
  assert.equal(d.kind, 'mutating');
});

test('an entry with no canonical path cannot be retired', () => {
  const none = { version: 1, responsibilities: { beta: { owner: 'apex' } }, components: {} };
  const d = classifyRegistryDiff(JSON.stringify(none), JSON.stringify({ ...none, responsibilities: {} }), { isRetired: () => true });
  assert.equal(d.kind, 'mutating');
});

test('retiring one entry while rewriting another is a mutation, not a mixed pass', () => {
  const sneaky = { version: 1, responsibilities: { alpha: { canonical: 'src/z.js' } }, components: {} };
  const d = classifyRegistryDiff(JSON.stringify(TWO), JSON.stringify(sneaky), { isRetired: (p) => p === 'src/b.js' });
  assert.equal(d.kind, 'mutating');
  assert.deepEqual(d.retired, ['responsibilities.beta']);
  assert.deepEqual(d.changed, ['responsibilities.alpha']);
});

test('components retire under the same rule', () => {
  const card = { version: 1, responsibilities: {}, components: { card: { canonical: 'src/b.js' } } };
  const d = classifyRegistryDiff(JSON.stringify(card), JSON.stringify({ ...card, components: {} }), { isRetired: (p) => p === 'src/b.js' });
  assert.equal(d.kind, 'retiring');
});

// ---------------------------------------------------------------------------
// And what the gate does with it, on both paths.

test('deleting a module, tombstoning it and retiring its entry raises nothing', () => {
  const { root, baseline } = retireBeta();
  assert.deepEqual(registryChecks(root, baseline), { branch: false, hash: false });
});

test('THE INVERTED CONTROL: removing an entry whose canonical is still LIVE raises it', () => {
  // Tombstoned, but the file is still there: the entry was dropped from
  // something that exists, which is an ownership change.
  const { root, baseline } = retireBeta({ deleteFile: false });
  assert.deepEqual(registryChecks(root, baseline), { branch: true, hash: true });
});

test('a deleted file with no tombstone is not a recorded retirement, and raises it', () => {
  const { root, baseline } = retireBeta({ tombstoneIt: false });
  assert.deepEqual(registryChecks(root, baseline), { branch: true, hash: true });
});

test('the single-file tombstones.json layout counts too', () => {
  const { root, baseline } = retireBeta({ tombstoneIt: false });
  put(root, '.greenroom/tombstones.json', JSON.stringify([{ path: 'src/b.js', reason: 'no caller' }]));
  assert.deepEqual(registryChecks(root, baseline), { branch: false, hash: false });
});

test('an unreadable tombstone record exempts nothing', () => {
  // The set can only ever exempt a removal, so a record we cannot read yields
  // the empty set and the gate blocks as it did before.
  const { root, baseline } = retireBeta();
  put(root, '.greenroom/tombstones/broken.json', '{ not json');
  assert.equal(tombstonedPaths(root, loadConfig(root)).size, 0);
  assert.deepEqual(registryChecks(root, baseline), { branch: true, hash: true });
});

test('with no base ref to read, a retirement is NOT waved through', () => {
  const { root, baseline } = retireBeta();
  const found = integrityViolations(root, loadConfig(root), baseline, { compareRef: null }).map((v) => v.rule);
  assert.ok(found.includes('policy/registry-changed'), 'no reference, no exemption');
});
