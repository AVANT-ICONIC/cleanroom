import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { SOURCE_EXTENSIONS } from '../defaults.mjs';

export const toPosix = (p) => p.split(path.sep).join('/');
export const exists = (p) => fs.existsSync(p);
export const readText = (p) => fs.readFileSync(p, 'utf8');
export const readJson = (p, fallback = null) => {
  try { return JSON.parse(readText(p)); } catch { return fallback; }
};
export const readJsonStrict = (p, label = toPosix(p)) => {
  let raw;
  try { raw = readText(p); }
  catch (error) { throw new Error(`Cannot read ${label}: ${error.message}`); }
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`Invalid JSON in ${label}: ${error.message}`); }
};
export const writeJson = (p, value) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
};
export const writeText = (p, value) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, value);
};
export const sha = (input) => crypto.createHash('sha256').update(input).digest('hex');

function escapeRegex(s) { return s.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'); }
export function globRegex(pattern) {
  const p = toPosix(pattern);
  let out = '^';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        i++;
        if (p[i + 1] === '/') { i++; out += '(?:.*/)?'; }
        else out += '.*';
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else out += escapeRegex(c);
  }
  return new RegExp(out + '$');
}
export function matchesAnyPattern(rel, patterns = []) {
  const p = toPosix(rel);
  return patterns.some((pattern) => globRegex(pattern).test(p));
}

export function isSafeRelativePath(value, { allowDot = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(toPosix(value));
  return normalized !== '..' && !normalized.startsWith('../') && (allowDot || normalized !== '.');
}


/**
 * What git ignores in this repository, as a set of repo-relative paths.
 *
 * WHY THIS EXISTS. The walker knew only the `ignore` list, which is a
 * hand-written approximation of a .gitignore: node_modules, dist, build,
 * .next, coverage, .turbo, .cache, vendor, target. Anything a project ignores
 * that is not on that list was scanned as if it were the project's own source.
 *
 * MEASURED 2026-09-17 in apex-nexus: `.apex/` is gitignored scratch holding
 * two vendored checkouts, and Green Room reported 75 NEW structural violations
 * against them -- dependency cycles, trivial wrappers and script chains inside
 * somebody else's code. `greenroom check` was BLOCKED in the working checkout
 * and PASSED in a clean worktree of the same commit, because the untracked
 * scratch existed in one and not the other. A gate whose verdict depends on
 * what is lying around beside the repository is not a gate.
 *
 * One `git ls-files` call, collapsed to directories, so a vendored tree costs
 * one entry rather than thousands. Not a repository, no git, or any failure:
 * an empty set, and the walk behaves exactly as it did before.
 */
export function gitIgnoredPaths(root) {
  const result = spawnSync(
    'git',
    ['-C', root, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0 || typeof result.stdout !== 'string') return new Set();
  return new Set(
    result.stdout
      .split('\n')
      .map((line) => line.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

export function walk(root, config) {
  const out = [];
  const ignored = new Set(config.ignore || []);
  const ignorePatterns = config.ignorePatterns || [];
  const maxBytes = Number(config.maxFileBytes || 0);
  // A project's own .gitignore is the authority on what is not its source.
  // `respectGitignore: false` opts out; anything else, including an absent
  // key, respects it.
  const gitIgnored = config.respectGitignore === false ? new Set() : gitIgnoredPaths(root);
  function visit(abs) {
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (ignored.has(entry.name)) continue;
      const full = path.join(abs, entry.name);
      const rel = toPosix(path.relative(root, full));
      if (gitIgnored.has(rel)) continue;
      if (matchesAnyPattern(rel, ignorePatterns)) continue;
      if (entry.isDirectory()) visit(full);
      else {
        if (maxBytes > 0) {
          try { if (fs.statSync(full).size > maxBytes) continue; } catch { continue; }
        }
        out.push({ abs: full, rel, ext: path.extname(entry.name).toLowerCase() });
      }
    }
  }
  visit(root);
  return out;
}

export function sourceFiles(root, config) {
  return walk(root, config).filter((f) => SOURCE_EXTENSIONS.has(f.ext));
}

export function isInsideAny(rel, roots = []) {
  return roots.some((r) => rel === r || rel.startsWith(`${r}/`));
}
