import path from 'node:path';
import { matchesAnyPattern } from '../lib/fs.mjs';
import { violation } from '../violations.mjs';

const BAD = /(?:^|[-_.])(fix(?:ed)?|final|new|old|backup|copy|temp|tmp|v\d+)(?:[-_.]|$)/i;
export function analyzeNaming(files, config) {
  if (!config.rules.suspiciousFilenames) return [];
  return files
    .filter((f) => BAD.test(path.basename(f.rel)))
    .filter((f) => !matchesAnyPattern(f.rel, config.naming?.allow || []))
    .map((f) => violation('naming/suspicious', [f.rel], `Suspicious version/fix filename: ${f.rel}`, path.basename(f.rel)));
}
