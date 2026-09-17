import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { initialize } from '../src/init.mjs';
import { loadConfig } from '../src/config.mjs';
import { scan } from '../src/scanner.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'greenroom-bench-'));
try {
  initialize(root, { existing: true });
  const src = path.join(root, 'src');
  fs.mkdirSync(src, { recursive: true });
  const count = Number(process.env.GREENROOM_BENCH_FILES || 4000);
  for (let i = 0; i < count; i++) {
    fs.writeFileSync(path.join(src, `module-${i}.ts`), `export const value${i} = ${i};\nexport function fn${i}(x: number) { return x + value${i}; }\n`);
  }
  const start = performance.now();
  const result = scan(root, loadConfig(root));
  const elapsed = performance.now() - start;
  if (result.files < count) throw new Error(`Expected at least ${count} files, scanned ${result.files}`);
  const limit = Number(process.env.GREENROOM_BENCH_LIMIT_MS || 8000);
  if (elapsed > limit) throw new Error(`Benchmark exceeded ${limit} ms: ${elapsed.toFixed(1)} ms`);
  console.log(`Benchmark: PASS — ${result.files} source files in ${elapsed.toFixed(1)} ms (${result.violations.length} violations)`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
