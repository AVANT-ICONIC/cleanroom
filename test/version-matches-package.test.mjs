import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { VERSION } from '../src/version.mjs';

const require = createRequire(import.meta.url);

test('the reported version is the package version, not a copy of it', () => {
  // The regression this guards: version.mjs held a hand-written '1.0.0' while
  // package.json said 1.0.1 and the code carried a new analyzer. CI pinned a
  // version, asked the binary which version it was, believed the answer, and
  // verified nothing.
  assert.equal(VERSION, require('../package.json').version);
});

test('the version is a real semver, so a pin can be compared against it', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});
