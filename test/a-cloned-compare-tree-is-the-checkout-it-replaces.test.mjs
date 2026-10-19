import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cloneRefTree, treeIsRef, withRefWorktree } from '../src/comparison.mjs';

const darwin = process.platform === 'darwin';

function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
/** The bytes a checkout of `rev:rel` writes, after this platform's filters (CRLF under autocrlf on Windows). */
function checkedOutBytes(root, rev, rel) { return execFileSync('git', ['cat-file', '--filters', `${rev}:${rel}`], { cwd: root, encoding: 'utf8' }); }
function put(root, rel, text, mode) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  if (mode && process.platform !== 'win32') fs.chmodSync(p, mode);
}

/** Every path under `dir` except .git, with its kind, exec bit and bytes or link target. */
function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
      if (!rel && name === '.git') continue;
      const r = rel ? `${rel}/${name}` : name;
      const st = fs.lstatSync(path.join(dir, r));
      if (st.isSymbolicLink()) out[r] = `link:${fs.readlinkSync(path.join(dir, r))}`;
      else if (st.isDirectory()) { out[`${r}/`] = 'dir'; walk(r); }
      else out[r] = `${st.mode & 0o111 ? 'x' : '-'}:${fs.readFileSync(path.join(dir, r), 'utf8')}`;
    }
  };
  walk('');
  return out;
}

// A checkout that differs from its base in every way the clone must undo.
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'green-room-clone-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Green Room Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  put(root, '.gitignore', 'node_modules/\n*.log\n');
  put(root, 'src/a.ts', 'export const a = 1;\n');
  put(root, 'src/deep/b.ts', 'export const b = 1;\n');
  put(root, 'src/deep/c.ts', 'export const c = 1;\n');
  put(root, 'bin/run.sh', '#!/bin/sh\necho base\n', 0o755);
  put(root, 'docs/keep.md', 'base doc\n');
  put(root, 'lib/stable.ts', 'export const stable = 1;\n');
  put(root, 'gone-later.ts', 'export const gone = 1;\n');
  if (process.platform !== 'win32') fs.symlinkSync('src/a.ts', path.join(root, 'link-to-a'));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  // A committed change on the branch, a staged one, an unstaged one, a deletion,
  // a mode change, untracked work and ignored junk.
  put(root, 'src/deep/b.ts', 'export const b = 2; // committed on the branch\n');
  put(root, 'added-on-branch.ts', 'export const added = 1;\n');
  git(root, 'rm', '-q', 'gone-later.ts');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'branch');
  put(root, 'src/deep/c.ts', 'export const c = 3; // staged\n');
  git(root, 'add', 'src/deep/c.ts');
  put(root, 'src/a.ts', 'export const a = 9; // unstaged\n');
  fs.rmSync(path.join(root, 'docs', 'keep.md'));
  if (process.platform !== 'win32') fs.chmodSync(path.join(root, 'bin', 'run.sh'), 0o644);
  put(root, 'src/untracked-lane-work.ts', 'export const lane = 1;\n');
  put(root, 'node_modules/pkg/index.js', 'ignored junk\n');
  put(root, 'src/deep/debug.log', 'ignored log\n');
  return { root, base };
}

test('the cloned compare tree holds exactly the base commit, byte for byte, like the checkout it replaces', { skip: !darwin && 'clonefile is APFS-only; elsewhere the checkout is used and this has nothing to compare' }, () => {
  const { root, base } = repo();
  const cloned = fs.mkdtempSync(path.join(os.tmpdir(), 'green-room-cloned-'));
  const checkedOut = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'green-room-checkout-')), 'tree');
  try {
    const stats = {};
    assert.equal(cloneRefTree(root, base, path.join(cloned, 'tree'), { stats }), true);
    git(root, 'worktree', 'add', '--detach', '--quiet', checkedOut, base);
    assert.deepEqual(snapshot(path.join(cloned, 'tree')), snapshot(checkedOut));
    assert.equal(fs.existsSync(path.join(cloned, 'tree', '.git')), false, 'the clone is never a second registered worktree');
    // a.ts (unstaged), b.ts (committed), c.ts (staged), keep.md (deleted), gone-later.ts (deleted), run.sh (mode).
    assert.equal(stats.writtenFiles, 6, JSON.stringify(stats));
    assert.ok(stats.clonedEntries > 0);
  } finally {
    try { git(root, 'worktree', 'remove', '--force', checkedOut); } catch {}
    for (const d of [root, cloned, path.dirname(checkedOut)]) fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a compare run registers no worktree and leaves no tree behind', () => {
  const { root, base } = repo();
  try {
    const before = git(root, 'worktree', 'list', '--porcelain');
    const stats = {};
    let seen = null;
    const result = withRefWorktree(root, base, (tree) => {
      seen = tree;
      // The base bytes, not the unstaged edit, exactly as a checkout of the base writes them here.
      assert.equal(fs.readFileSync(path.join(tree, 'src', 'a.ts'), 'utf8'), checkedOutBytes(root, base, 'src/a.ts'));
      assert.match(fs.readFileSync(path.join(tree, 'src', 'a.ts'), 'utf8'), /^export const a = 1;\r?\n$/);
      assert.equal(fs.existsSync(path.join(tree, 'node_modules')), false, 'ignored junk never reaches the base scan');
      assert.equal(fs.existsSync(path.join(tree, 'src', 'untracked-lane-work.ts')), false, 'untracked work never reaches the base scan');
      if (darwin) assert.equal(git(root, 'worktree', 'list', '--porcelain'), before, 'nothing is registered while the clone is in use');
      return 'scanned';
    }, { stats });
    assert.equal(result, 'scanned');
    assert.equal(stats.method, darwin ? 'clone' : 'worktree');
    assert.equal(fs.existsSync(path.dirname(seen)), false);
    assert.equal(git(root, 'worktree', 'list', '--porcelain'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('GREENROOM_COMPARE_CLONE=0 keeps the plain checkout', () => {
  const { root, base } = repo();
  const saved = process.env.GREENROOM_COMPARE_CLONE;
  process.env.GREENROOM_COMPARE_CLONE = '0';
  try {
    const stats = {};
    withRefWorktree(root, base, (tree) => assert.ok(fs.existsSync(path.join(tree, '.git'))), { stats });
    assert.equal(stats.method, 'worktree');
  } finally {
    if (saved === undefined) delete process.env.GREENROOM_COMPARE_CLONE; else process.env.GREENROOM_COMPARE_CLONE = saved;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// A writer that lands between git's readings and the clone must never be scanned as the base.
for (const [name, write] of [
  ['a tracked file changed after git read it', (root) => put(root, 'lib/stable.ts', 'export const stable = 2; // written mid-clone\n')],
  ['an untracked file created after git read the tree', (root) => put(root, 'lib/late-lane-work.ts', 'export const late = 1;\n')],
]) {
  test(`${name} sends the compare run back to the checkout`, { skip: !darwin && 'the clone runs on APFS only' }, () => {
    const { root, base } = repo();
    try {
      const stats = {};
      const seen = withRefWorktree(root, base, (tree) => snapshot(tree), { stats, beforeCopy: () => write(root) });
      assert.equal(stats.method, 'worktree', JSON.stringify(stats));
      assert.equal(seen['lib/stable.ts'], '-:export const stable = 1;\n');
      assert.equal(seen['lib/late-lane-work.ts'], undefined);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('a compare tree with one path more or one path less than the base commit is refused', { skip: process.platform === 'win32' && 'symlinks need privileges on Windows' }, () => {
  const { root, base } = repo();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'green-room-verify-'));
  const tree = path.join(parent, 'tree');
  try {
    git(root, 'worktree', 'add', '--detach', '--quiet', tree, base);
    fs.rmSync(path.join(tree, '.git'), { force: true });
    assert.equal(treeIsRef(root, base, tree), true, 'a fresh checkout is the base commit');
    put(tree, 'src/extra.ts', 'not in the base\n');
    assert.equal(treeIsRef(root, base, tree), false, 'an extra file');
    fs.rmSync(path.join(tree, 'src', 'extra.ts'));
    fs.mkdirSync(path.join(tree, 'empty-extra'));
    assert.equal(treeIsRef(root, base, tree), false, 'an extra directory');
    fs.rmSync(path.join(tree, 'empty-extra'), { recursive: true });
    fs.rmSync(path.join(tree, 'docs', 'keep.md'));
    assert.equal(treeIsRef(root, base, tree), false, 'a missing file');
  } finally {
    try { git(root, 'worktree', 'remove', '--force', tree); } catch {}
    for (const d of [root, parent]) fs.rmSync(d, { recursive: true, force: true });
  }
});
