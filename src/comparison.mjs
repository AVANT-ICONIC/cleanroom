import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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

export function withRefWorktree(root, ref, fn) {
  if (!ref || !hasGit(root)) return null;
  const resolved = git(root, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!resolved) return null;
  sweepStaleCompareTrees(root);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), COMPARE_PREFIX));
  fs.writeFileSync(path.join(parent, OWNER_FILE), String(process.pid));
  const target = path.join(parent, 'tree');
  try {
    execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', '--quiet', target, resolved], { stdio: ['ignore', 'ignore', 'pipe'] });
    return fn(target, resolved);
  } finally {
    try { execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', target], { stdio: 'ignore' }); } catch {}
    try { fs.rmSync(parent, { recursive: true, force: true }); } catch {}
  }
}

export function refHasGreenRoom(root) {
  return exists(path.join(root, '.greenroom.json')) && exists(path.join(root, '.greenroom', 'baseline.json'));
}
