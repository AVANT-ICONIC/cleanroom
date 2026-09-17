import test from 'node:test';
import assert from 'node:assert/strict';

import { parseVerifyMode } from '../scripts/verify.mjs';

test('verify mode is strict by default', () => {
  assert.equal(parseVerifyMode([], {}), false);
});

test('verify mode enables governance with an explicit CLI flag', () => {
  assert.equal(parseVerifyMode(['--governance'], {}), true);
});

test('verify mode keeps the environment switch for automation', () => {
  assert.equal(parseVerifyMode([], { GREENROOM_VERIFY_GOVERNANCE: '1' }), true);
});

test('verify mode rejects unknown options', () => {
  assert.throws(
    () => parseVerifyMode(['--skip-checks'], {}),
    /Unknown verify option\(s\): --skip-checks/
  );
});
