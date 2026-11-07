// THE BASE SCAN IS A FUNCTION OF THE BASE TREE, SO IT IS ANSWERED ONCE PER TREE.
//
// MEASURED 2026-11-07 on apex-nexus: one `greenroom check` took 37 s wall, 33 CPU-s
// and 700 MB, and it runs in every PR's entropy gate and every instant-land box
// gate. A third of each run copied the base commit into a temp tree and scanned it,
// although dozens of checks a day compare against the same master tree. The scan
// reads only the files of that tree (its own config, baseline and waivers
// included), so the result is keyed by the tree's object id plus a hash of this
// package's own source: a changed tree or a changed checker is a new key, never a
// stale answer. An unreadable or malformed entry is a miss, never a verdict.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));
let codeHash = null;

function hashTree(dir, h) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) hashTree(full, h);
    else if (name.endsWith('.mjs') || name.endsWith('.js') || name.endsWith('.json')) { h.update(path.relative(SRC, full)); h.update('\0'); h.update(fs.readFileSync(full)); h.update('\0'); }
  }
}

/** A digest of the checker's own source: a new checker never reads an old answer. */
export function checkerHash() {
  if (!codeHash) { const h = crypto.createHash('sha256'); hashTree(SRC, h); codeHash = h.digest('hex'); }
  return codeHash;
}

export function cacheDir(env = process.env) {
  if (env.GREENROOM_CACHE === '0') return null;
  return env.GREENROOM_CACHE_DIR || path.join(os.homedir(), '.cache', 'cleanroom', 'base-scan');
}

/** The tree object id of a ref, or null when git cannot read it. */
export function treeOf(root, ref) {
  try { return execFileSync('git', ['-C', root, 'rev-parse', '--verify', `${ref}^{tree}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; }
  catch { return null; }
}

function keyFile(dir, tree) { return path.join(dir, `${crypto.createHash('sha256').update(`${tree}\0${checkerHash()}`).digest('hex')}.json`); }

/** { hit: true, value } or { hit: false }. value is { violations } or { none: true }. */
export function readBaseScan(tree, { dir = cacheDir() } = {}) {
  if (!dir || !tree) return { hit: false };
  try {
    const entry = JSON.parse(fs.readFileSync(keyFile(dir, tree), 'utf8'));
    if (entry?.tree !== tree || entry?.checker !== checkerHash()) return { hit: false };
    if (entry.none === true) return { hit: true, value: { none: true } };
    if (!Array.isArray(entry.violations)) return { hit: false };
    return { hit: true, value: { violations: entry.violations } };
  } catch { return { hit: false }; }
}

/** Written whole through a rename; a failed write costs the next run time, not truth. */
export function writeBaseScan(tree, value, { dir = cacheDir() } = {}) {
  if (!dir || !tree) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = keyFile(dir, tree);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ tree, checker: checkerHash(), ...(value.none ? { none: true } : { violations: value.violations }) }));
    fs.renameSync(tmp, file);
  } catch { /* cost only */ }
}
