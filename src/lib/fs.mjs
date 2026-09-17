import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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


export function walk(root, config) {
  const out = [];
  const ignored = new Set(config.ignore || []);
  const ignorePatterns = config.ignorePatterns || [];
  const maxBytes = Number(config.maxFileBytes || 0);
  function visit(abs) {
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (ignored.has(entry.name)) continue;
      const full = path.join(abs, entry.name);
      const rel = toPosix(path.relative(root, full));
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
