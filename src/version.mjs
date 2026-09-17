import { createRequire } from 'node:module';

// READ IT, DO NOT RETYPE IT.
//
// This was a hand-written literal, and it drifted: package.json said 1.0.1 and
// released code carried a new analyzer, while `greenroom version` still
// answered 1.0.0. A CI job that pins a version and then trusts that answer was
// verifying nothing -- measured 2026-09-17, when a self-hosted runner ran an
// unreleased working copy and reported 48 violations that the pinned release
// cannot produce, against a repository whose files had not changed.
//
// A version string that can disagree with the artifact it names is worse than
// no version string, because it is trusted.
const require = createRequire(import.meta.url);

export const VERSION = require('../package.json').version;
