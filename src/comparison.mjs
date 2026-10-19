import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { exists } from './lib/fs.mjs';

function git(root, args, { quiet = true } = {}) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'pipe'] }).trim();
  } catch { return null; }
}

export function hasGit(root) { return git(root, ['rev-parse', '--is-inside-work-tree']) === 'true'; }
export function refExists(root, ref) { return Boolean(git(root, ['rev-parse', '--verify', `${ref}^{commit}`])); }
export function isDirty(root) { const value = git(root, ['status', '--porcelain']); return value == null ? false : Boolean(value); }
export function currentBranch(root) { return git(root, ['branch', '--show-current']) || null; }

function firstExisting(root, refs) { return refs.find((r) => refExists(root, r)) || null; }

export function inferCompareRef(root, config, explicit = null) {
  if (explicit) return explicit;
  if (process.env.GREENROOM_COMPARE_REF) return process.env.GREENROOM_COMPARE_REF;
  if (process.env.GITHUB_BASE_REF) {
    return firstExisting(root, [`origin/${process.env.GITHUB_BASE_REF}`, process.env.GITHUB_BASE_REF]) || process.env.GITHUB_BASE_REF;
  }
  if (!hasGit(root) || !refExists(root, 'HEAD')) return null;
  const branch = currentBranch(root);
  const defaults = config.defaultBranches || ['main', 'master'];
  if (branch && !defaults.includes(branch)) {
    const candidateRefs = defaults.flatMap((x) => [`origin/${x}`, x]);
    const base = firstExisting(root, candidateRefs);
    if (base) return git(root, ['merge-base', 'HEAD', base]) || base;
    if (isDirty(root)) return 'HEAD';
    return null;
  }
  if (branch && defaults.includes(branch)) {
    if (isDirty(root)) return 'HEAD';
    if (refExists(root, 'HEAD^')) return 'HEAD^';
  }
  if (isDirty(root)) return 'HEAD';
  return null;
}

const COMPARE_PREFIX = 'greenroom-compare-';
const OWNER_FILE = 'owner.pid';
// A tree with no owner file predates it; give a run that long to finish first.
const UNOWNED_GRACE_MS = 6 * 60 * 60 * 1000;

function ownerAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

// The finally below never runs when a run is killed (a deadline SIGKILL), and
// each leftover is a full checkout. Remove trees whose owner is gone.
export function sweepStaleCompareTrees(root, { tmp = os.tmpdir(), now = Date.now() } = {}) {
  let names;
  try { names = fs.readdirSync(tmp); } catch { return []; }
  const removed = [];
  for (const name of names) {
    if (!name.startsWith(COMPARE_PREFIX)) continue;
    const dir = path.join(tmp, name);
    let pid = null;
    try { pid = Number.parseInt(fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8'), 10); } catch {}
    if (pid != null && !Number.isNaN(pid)) {
      if (ownerAlive(pid)) continue;
    } else {
      let mtime;
      try { mtime = fs.statSync(dir).mtimeMs; } catch { continue; }
      if (now - mtime < UNOWNED_GRACE_MS) continue;
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); removed.push(dir); } catch {}
  }
  if (removed.length && root) git(root, ['worktree', 'prune']);
  return removed;
}

// THE COMPARISON TREE IS CLONED, NOT CHECKED OUT, WHERE THE DISK CAN CLONE.
//
// MEASURED 2026-10-19 on the apex-nexus fleet Mac: `greenroom check` ran ~20
// times per 10 minutes, and each one wrote a full `git worktree add` of the
// base commit (~160 MB, 14.5k files) into $TMPDIR and deleted it again. Free
// space fell ~100 MB/min under load and the fleet stopped at its 25 GB floor.
//
// The checkout being checked already holds almost every file of the base
// commit, byte for byte. On APFS `cp -c` clones a file (clonefile(2)): the
// copy shares the source's blocks and costs only metadata. So the tree is
// built from what is already on disk:
//
//   1. git says, per path of the base commit, whether the working file is that
//      exact blob: same blob id and mode in the index, stage 0, not
//      assume-unchanged or skip-worktree, and no unstaged change.
//   2. Every directory holding nothing else (no untracked or ignored entry, no
//      path the base commit lacks, no path whose bytes differ) is cloned whole;
//      one `cp -c -R` per parent directory for all of them at once.
//   3. Every other base path is written from git's object store through
//      `cat-file --batch --filters`, so filters apply exactly as a checkout's.
//
// The tree holds exactly the base commit's paths and bytes, like the checkout
// it replaces, and has no .git: the scan only reads files, and git ignore
// rules have nothing to hide in a tree that holds only tracked paths. Anything
// unexpected (no APFS, a path with a newline, a git reading that fails) falls
// back to `git worktree add`, which stays the reference behaviour.
export function cloneRefTree(root, resolved, target, { stats = null } = {}) {
  if (process.platform !== 'darwin' || process.env.GREENROOM_COMPARE_CLONE === '0') return false;
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top) return false;
  const run = (args, input) => {
    const r = spawnSync('git', ['-C', top, ...args], { input, maxBuffer: 1024 * 1024 * 1024, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'] });
    if (r.status !== 0 || r.error) throw new Error(`git ${args[0]} failed`);
    return r.stdout;
  };
  const split = (buf) => buf.toString('utf8').split('\0').filter(Boolean);

  // The base commit: path -> { mode, type, sha }.
  const ref = new Map();
  for (const rec of split(run(['ls-tree', '-r', '-z', '--full-tree', resolved]))) {
    const tab = rec.indexOf('\t');
    const [mode, type, sha] = rec.slice(0, tab).split(' ');
    ref.set(rec.slice(tab + 1), { mode, type, sha });
  }
  // The index, with its tag: H is plain; lowercase is assume-unchanged, S is skip-worktree.
  const index = new Map();
  for (const rec of split(run(['ls-files', '-s', '-v', '-z']))) {
    const tab = rec.indexOf('\t');
    const [tag, mode, sha, stage] = rec.slice(0, tab).split(' ');
    index.set(rec.slice(tab + 1), { tag, mode, sha, stage });
  }
  const dirty = new Set(split(run(['diff', '--name-only', '--no-renames', '-z'])));
  // Every untracked entry, ignored ones included, directories collapsed.
  const untracked = split(run(['ls-files', '-z', '--others', '--directory'])).map((p) => p.replace(/\/$/, ''));

  for (const p of [...ref.keys(), ...index.keys(), ...untracked]) if (p.includes('\n')) return false;

  // What must not arrive in the tree by a whole-directory clone.
  const excluded = new Set(['.git', ...untracked]);
  const write = [];
  for (const [p, e] of ref) {
    if (e.type !== 'blob') continue; // a gitlink becomes an empty directory, as a checkout leaves it
    const i = index.get(p);
    const same = i && i.stage === '0' && i.tag === 'H' && i.sha === e.sha && i.mode === e.mode && !dirty.has(p);
    if (!same) { excluded.add(p); write.push(p); }
  }
  for (const [p, i] of index) if (!ref.has(p) || i.mode === '160000') excluded.add(p);
  for (const [p, e] of ref) if (e.type === 'commit') excluded.add(p);
  // A directory is mixed when anything below it is excluded; it is entered, not cloned.
  const mixed = new Set(['']);
  for (const p of excluded) {
    let d = path.posix.dirname(p);
    while (d !== '.' && !mixed.has(d)) { mixed.add(d); d = path.posix.dirname(d); }
  }

  fs.mkdirSync(target, { recursive: true });
  let clonedEntries = 0;
  const visit = (rel) => {
    const src = rel ? path.join(top, rel) : top;
    const dst = rel ? path.join(target, rel) : target;
    fs.mkdirSync(dst, { recursive: true });
    const batch = [];
    for (const name of fs.readdirSync(src)) {
      const r = rel ? `${rel}/${name}` : name;
      if (excluded.has(r)) continue;
      if (mixed.has(r)) { visit(r); continue; }
      batch.push(path.join(src, name));
    }
    if (!batch.length) return;
    // -c clonefile(2), -R trees, -P never follow a link, -p keep modes. One process for the directory.
    const c = spawnSync('cp', ['-c', '-R', '-P', '-p', ...batch, `${dst}/`], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (c.status !== 0) throw new Error(`cp -c failed in ${rel || '.'}: ${String(c.stderr).trim().split('\n')[0]}`);
    clonedEntries += batch.length;
  };
  visit('');

  // Base paths that are not on disk as-is come from git's objects, filtered like a checkout.
  let writtenBytes = 0;
  if (write.length) {
    const out = run(['cat-file', '--batch', '--filters'], write.map((p) => `${ref.get(p).sha} ${p}\n`).join(''));
    let at = 0;
    for (const p of write) {
      const nl = out.indexOf(10, at);
      const header = out.subarray(at, nl).toString('utf8').split(' ');
      if (header[1] !== 'blob') throw new Error(`cat-file gave ${header.join(' ')} for ${p}`);
      const size = Number(header[2]);
      const body = out.subarray(nl + 1, nl + 1 + size);
      at = nl + 1 + size + 1;
      const dst = path.join(target, p);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.rmSync(dst, { force: true, recursive: true });
      const mode = ref.get(p).mode;
      if (mode === '120000') fs.symlinkSync(body.toString('utf8'), dst);
      else fs.writeFileSync(dst, body, { mode: mode === '100755' ? 0o755 : 0o644 });
      writtenBytes += size;
    }
  }
  for (const [p, e] of ref) if (e.type === 'commit') fs.mkdirSync(path.join(target, p), { recursive: true });
  if (stats) Object.assign(stats, { method: 'clone', clonedEntries, writtenFiles: write.length, writtenBytes });
  return true;
}

export function withRefWorktree(root, ref, fn, { stats = null } = {}) {
  if (!ref || !hasGit(root)) return null;
  const resolved = git(root, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!resolved) return null;
  sweepStaleCompareTrees(root);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), COMPARE_PREFIX));
  fs.writeFileSync(path.join(parent, OWNER_FILE), String(process.pid));
  const target = path.join(parent, 'tree');
  let registered = false;
  try {
    let cloned = false;
    try { cloned = cloneRefTree(root, resolved, target, { stats }); } catch { cloned = false; }
    if (!cloned) {
      fs.rmSync(target, { recursive: true, force: true });
      execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', '--quiet', target, resolved], { stdio: ['ignore', 'ignore', 'pipe'] });
      registered = true;
      if (stats) Object.assign(stats, { method: 'worktree' });
    }
    return fn(target, resolved);
  } finally {
    if (registered) try { execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', target], { stdio: 'ignore' }); } catch {}
    try { fs.rmSync(parent, { recursive: true, force: true }); } catch {}
  }
}

export function refHasGreenRoom(root) {
  return exists(path.join(root, '.greenroom.json')) && exists(path.join(root, '.greenroom', 'baseline.json'));
}
