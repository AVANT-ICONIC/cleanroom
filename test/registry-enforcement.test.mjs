import test from 'node:test';
import assert from 'node:assert/strict';
import { tempRepo, put } from './helpers.mjs';
import { initialize } from '../src/init.mjs';
import { loadConfig } from '../src/config.mjs';
import { registerCanonical } from '../src/register.mjs';
import { scan } from '../src/scanner.mjs';

test('registered components expose exact-name parallel primitives', () => {
  const root = tempRepo(); initialize(root, { existing: true });
  put(root, 'src/components/ui/Card.tsx', 'export const Card = () => null;\n');
  const config = loadConfig(root);
  registerCanonical(root, config, 'component', 'card', 'src/components/ui/Card.tsx', ['panel']);
  put(root, 'src/features/dashboard/Card.tsx', 'export const Card = () => null;\n');
  const result = scan(root, config);
  assert.ok(result.violations.some((v) => v.rule === 'registry/noncanonical-component'));
});
