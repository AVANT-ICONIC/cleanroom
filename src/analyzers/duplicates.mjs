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

export function analyzeDuplicates(files, config) {
  const out = [];
  const codeFiles = files.filter((f) => !['.css', '.scss', '.sass', '.less'].includes(f.ext));
  if (config.rules.duplicateFiles) {
    const groups = new Map();
    for (const f of codeFiles) {
      const norm = normalizeFile(readText(f.abs));
      if (norm.length < 120) continue;
      const h = sha(norm);
      if (!groups.has(h)) groups.set(h, []);
      groups.get(h).push(f.rel);
    }
    for (const paths of groups.values()) {
      if (paths.length > 1) out.push(violation('duplication/file', paths, `Duplicate files: ${paths.join(', ')}`, 'exact-normalized-file'));
    }
  }

  if (config.rules.duplicateBlocks) {
    const minLines = config.duplicateBlocks.minLines || 8;
    const index = new Map();
    for (const f of codeFiles) {
      if (matchesAnyPattern(f.rel, config.duplicateBlocks.ignorePatterns || [])) continue;
      const lines = readText(f.abs).split(/\r?\n/).map(normalizeLine);
      for (let i = 0; i <= lines.length - minLines; i++) {
        const window = lines.slice(i, i + minLines);
        if (window.filter(Boolean).length < Math.ceil(minLines * 0.75)) continue;
        const block = window.join('\n');
        if (block.length < 180) continue;
        const h = sha(block);
        const hit = { path: f.rel, start: i + 1 };
        if (!index.has(h)) index.set(h, { block, hits: [] });
        index.get(h).hits.push(hit);
      }
    }
    // Sliding windows produce many adjacent hashes for one copied region. Collapse
    // those overlaps, but keep separate copied regions between the same files.
    // Otherwise two distinct copy/paste problems can look like one violation.
    const emittedByFileSet = new Map();
    const candidates = [];
    for (const [h, group] of index) {
      const uniqueFiles = [...new Set(group.hits.map((x) => x.path))].sort();
      if (uniqueFiles.length < (config.duplicateBlocks.minOccurrences || 2)) continue;
      const starts = new Map();
      for (const file of uniqueFiles) {
        const values = group.hits.filter((x) => x.path === file).map((x) => x.start);
        starts.set(file, Math.min(...values));
      }
      candidates.push({ h, group, uniqueFiles, starts });
    }
    candidates.sort((a, b) => {
      const ak = a.uniqueFiles.join('|');
      const bk = b.uniqueFiles.join('|');
      if (ak !== bk) return ak.localeCompare(bk);
      const af = a.uniqueFiles[0];
      return a.starts.get(af) - b.starts.get(af) || a.h.localeCompare(b.h);
    });

    for (const candidate of candidates) {
      const { h, group, uniqueFiles, starts } = candidate;
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
