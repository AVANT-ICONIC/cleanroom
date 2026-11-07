import { readText, sha, matchesAnyPattern } from '../lib/fs.mjs';
import { violation } from '../violations.mjs';

function normalizeFile(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeLine(line) {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, 'STR')
    .replace(/\b\d+(?:\.\d+)?\b/g, 'NUM')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A normalized line carrying something other than punctuation and blanks. */
function isSubstantive(line) { return Boolean(line) && /\w/.test(line); }

/** 32-bit FNV-1a of a string, with a seed so two independent hashes come from one routine. */
function fnv(str, seed) {
  let h = seed;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}
const SEED_A = 0x811c9dc5 | 0;
const SEED_B = 0x01000193 ^ 0x5bd1e995;
// A place is a window's offset in all indexed lines laid end to end: the file's
// first-line offset plus the start. Unique for any file length, and a small
// integer for V8 below 2^31 lines in total.
function fileOf(bases, place) {
  let lo = 0; let hi = bases.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bases[mid] <= place) lo = mid; else hi = mid - 1; }
  return lo;
}

/**
 * The windows of one file that pass the block filters, as start offsets (0-based),
 * each with its numeric key. Calls `emit(start, key)` and allocates nothing per
 * window: line hashes and the two filter counts roll along the file.
 */
function eachWindow(lines, minLines, enough, emit) {
  const n = lines.length;
  if (n < minLines) return;
  const ha = new Int32Array(n);
  const hb = new Int32Array(n);
  const len = new Int32Array(n);
  const nonEmpty = new Uint8Array(n);
  const substantive = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const l = lines[i];
    ha[i] = fnv(l, SEED_A); hb[i] = fnv(l, SEED_B); len[i] = l.length;
    nonEmpty[i] = l ? 1 : 0; substantive[i] = isSubstantive(l) ? 1 : 0;
  }
  let ne = 0; let sub = 0; let chars = 0;
  for (let i = 0; i < minLines; i++) { ne += nonEmpty[i]; sub += substantive[i]; chars += len[i]; }
  for (let i = 0; ; i++) {
    // Same three gates, same order, as the text version: enough non-empty lines,
    // enough substantive lines, and a joined block of at least 180 characters.
    if (ne >= enough && sub >= enough && chars + minLines - 1 >= 180) {
      let a = SEED_A; let b = SEED_B;
      for (let k = i; k < i + minLines; k++) { a = Math.imul(a ^ ha[k], 16777619); b = Math.imul(b ^ hb[k], 16777619); }
      // 32 + 21 bits: an exact integer key. A collision only merges two windows
      // into one bucket; the sha256 pass below splits them again.
      emit(i, (a >>> 0) * 2097152 + (b >>> 11));
    }
    if (i + minLines >= n) break;
    ne += nonEmpty[i + minLines] - nonEmpty[i];
    sub += substantive[i + minLines] - substantive[i];
    chars += len[i + minLines] - len[i];
  }
}

export function analyzeDuplicates(files, config) {
  const out = [];
  const codeFiles = files.filter((f) => !['.css', '.scss', '.sass', '.less'].includes(f.ext));
  const fileRule = Boolean(config.rules.duplicateFiles);
  const blockRule = Boolean(config.rules.duplicateBlocks);
  const minLines = config.duplicateBlocks?.minLines || 8;
  const enough = Math.ceil(minLines * 0.75);
  const ignorePatterns = config.duplicateBlocks?.ignorePatterns || [];
  const groups = new Map();
  // THE INDEX HOLDS A NUMBER PER WINDOW, NEVER TEXT OR A HEX DIGEST. MEASURED
  // 2026-11-07 on apex-nexus (5,961 files): keeping each window's block took the
  // heap from 34 MB to 215 MB; after that, a 64-char sha256 key and a [path, start]
  // array per window still held most of what was left. Now the key is a 53-bit
  // integer from two rolling FNV hashes and the value a packed place. Only buckets
  // that span enough files are re-read and split by the real sha256, so the
  // reported digest, grouping and order are the same as hashing every window.
  const index = new Map();
  const blockFiles = [];
  const bases = [];
  let total = 0;
  // One read per file serves both rules (it used to be read once for each).
  for (const f of codeFiles) {
    const blocks = blockRule && !matchesAnyPattern(f.rel, ignorePatterns);
    if (!fileRule && !blocks) continue;
    const text = readText(f.abs);
    if (fileRule) {
      const norm = normalizeFile(text);
      if (norm.length >= 120) {
        const h = sha(norm);
        if (!groups.has(h)) groups.set(h, []);
        groups.get(h).push(f.rel);
      }
    }
    if (blocks) {
      const lines = text.split(/\r?\n/).map(normalizeLine);
      blockFiles.push(f); bases.push(total);
      const base = total;
      total += lines.length;
      eachWindow(lines, minLines, enough, (i, key) => {
        const place = base + i;
        const prior = index.get(key);
        if (prior === undefined) index.set(key, place);
        else if (typeof prior === 'number') index.set(key, [prior, place]);
        else prior.push(place);
      });
    }
  }
  if (fileRule) {
    for (const paths of groups.values()) {
      if (paths.length > 1) out.push(violation('duplication/file', paths, `Duplicate files: ${paths.join(', ')}`, 'exact-normalized-file'));
    }
  }

  if (blockRule) {
    const minOccurrences = config.duplicateBlocks.minOccurrences || 2;
    // Buckets that could be a duplicate: enough distinct files under one key.
    const buckets = [];
    for (const seen of index.values()) {
      const places = typeof seen === 'number' ? [seen] : seen;
      const distinct = new Set(places.map((p) => fileOf(bases, p)));
      if (distinct.size >= minOccurrences) buckets.push(places);
    }
    index.clear();
    // Re-read only the files those buckets name and take each window's real sha256.
    const wanted = new Map();
    for (const places of buckets) for (const p of places) {
      const fi = fileOf(bases, p);
      if (!wanted.has(fi)) wanted.set(fi, new Set());
      wanted.get(fi).add(p - bases[fi]);
    }
    const digest = new Map();
    for (const [fi, starts] of wanted) {
      const lines = readText(blockFiles[fi].abs).split(/\r?\n/).map(normalizeLine);
      for (const i of starts) digest.set(bases[fi] + i, sha(lines.slice(i, i + minLines).join('\n')));
    }
    // Split each bucket by real digest. A real group never spans two keys, so this
    // is exactly the grouping a sha256-keyed index would have made.
    const byHash = new Map();
    for (const places of buckets) for (const p of places) {
      const h = digest.get(p);
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h).push(p);
    }

    // Sliding windows produce many adjacent hashes for one copied region. Collapse
    // those overlaps, but keep separate copied regions between the same files.
    // Otherwise two distinct copy/paste problems can look like one violation.
    const emittedByFileSet = new Map();
    const candidates = [];
    for (const [h, places] of byHash) {
      const entry = places.map((p) => { const fi = fileOf(bases, p); return [blockFiles[fi].rel, p - bases[fi] + 1]; });
      const uniqueFiles = [...new Set(entry.map(([path]) => path))].sort();
      if (uniqueFiles.length < minOccurrences) continue;
      const starts = new Map();
      for (const [path, start] of entry) {
        if (!starts.has(path) || start < starts.get(path)) starts.set(path, start);
      }
      candidates.push({ h, uniqueFiles, starts });
    }
    candidates.sort((a, b) => {
      const ak = a.uniqueFiles.join('|');
      const bk = b.uniqueFiles.join('|');
      if (ak !== bk) return ak.localeCompare(bk);
      const af = a.uniqueFiles[0];
      return a.starts.get(af) - b.starts.get(af) || a.h.localeCompare(b.h);
    });

    for (const candidate of candidates) {
      const { h, uniqueFiles, starts } = candidate;
      const key = uniqueFiles.join('|');
      const prior = emittedByFileSet.get(key) || [];
      const overlapsExisting = prior.some((positions) =>
        uniqueFiles.every((file) => Math.abs(starts.get(file) - positions.get(file)) < minLines)
      );
      if (overlapsExisting) continue;
      prior.push(starts);
      emittedByFileSet.set(key, prior);
      const previewHits = uniqueFiles.slice(0, 4).map((file) => `${file}:${starts.get(file)}`).join(', ');
      out.push(violation('duplication/block', uniqueFiles, `Duplicated code block across ${uniqueFiles.length} files`, `${h.slice(0, 12)} ${previewHits}`));
    }
  }
  return out;
}
