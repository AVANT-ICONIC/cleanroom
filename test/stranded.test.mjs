import test from 'node:test';
import assert from 'node:assert/strict';
import { tempRepo, put } from './helpers.mjs';
import { initialize } from '../src/init.mjs';
import { loadConfig } from '../src/config.mjs';
import { scan } from '../src/scanner.mjs';

test('tested but production-unreachable implementation is a stranded feature', () => {
  const root = tempRepo(); initialize(root, { existing: true });
  put(root, 'src/index.ts', "import './app';\n");
  put(root, 'src/app.ts', 'export const app = true;\n');
  put(root, 'src/choices.ts', 'export const choose = () => 42;\n');
  put(root, 'src/choices.test.ts', "import { choose } from './choices';\nif (choose() !== 42) throw new Error('bad');\n");
  const result = scan(root, loadConfig(root));
  assert.ok(result.violations.some((x) => x.rule === 'architecture/stranded-feature' && x.paths.includes('src/choices.ts')));
  const evidence = result.findings.find((x) => x.kind === 'stranded-feature' && x.scope.files.includes('src/choices.ts'));
  assert.equal(evidence?.confidence, 'proven');
});
