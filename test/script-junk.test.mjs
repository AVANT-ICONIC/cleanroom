import test from 'node:test';
import assert from 'node:assert/strict';
import { tempRepo, put } from './helpers.mjs';
import { initialize } from '../src/init.mjs';
import { loadConfig } from '../src/config.mjs';
import { scan } from '../src/scanner.mjs';

test('duplicate package-script commands are visible as review evidence', () => {
  const root = tempRepo(); initialize(root, { existing: true });
  put(root, 'src/index.ts', 'export const x = 1;\n');
  put(root, 'package.json', JSON.stringify({ scripts: { lint: 'eslint .', 'lint:ci': 'eslint .' } }, null, 2));
  const result = scan(root, loadConfig(root));
  const duplicate = result.findings.find((x) => x.kind === 'duplicate-package-script');
  assert.ok(duplicate);
  assert.equal(duplicate.action, 'human-review-required');
  assert.equal(result.violations.some((x) => x.rule === 'scripts/duplicate-package-script'), false);
});
