# Changelog

## 1.1.1 — unreleased

- check: half the memory and twice the speed, same verdict. Measured on apex-nexus (5,961 files), full scan output byte-identical, three interleaved runs each: peak RSS 163-167 MB and 8.3-9.6 s before, 105-111 MB and 5.5-5.9 s after.
  - duplication/block: the window index key is a 53-bit integer from two rolling FNV hashes of the normalized lines, and the value is one integer place (an offset into all indexed lines), not a 64-char sha256 key and a `[path, start]` array. The window filters roll along the file instead of slicing three arrays and joining a string per window. Only buckets spanning enough files are re-read and split by the real sha256, so digest, grouping and order are unchanged. Each file is read once for both duplication rules. Alone: 163-167 MB to 133-143 MB.
  - scan: the tree is walked once per scan, not four times (generated, script-junk and package-script chains each walked again and spawned `git ls-files` again), and the scripts analyzer takes the import graph the imports analyzer already built.
  - competing: tokens, token set and signature are computed once per file, not once per compared pair. `globRegex` compiles each pattern once.
  - cli: the shebang starts node with `--optimize-for-size` (via `env -S`, which npm's cmd-shim also parses on Windows), replacing `--max-semi-space-size=4`. The faster code let V8 grow the heap faster (162-173 MB at 4.0-4.2 s); the flag holds it back. The flag alone on the old code measured 135-141 MB and slower (11.3-12.3 s). `node src/cli.mjs` skips the shebang.
- duplication/block: the window index keeps where each window was seen as `[path, start]` pairs, never the window's text, which nothing read back. Measured on apex-nexus (5,961 files): the analyzer's heap growth fell from 181 MB to 19 MB. Peak RSS of `greenroom check` fell from 331 MB to 168 MB with a warm cache and from 597 MB to 240 MB cold, and the JSON verdict was identical.
- check: the base scan is answered once per base tree. It is cached under `~/.cache/cleanroom/base-scan`, keyed by the tree object id plus a hash of this package's source, so a changed tree or a changed checker is a new key. An unreadable entry is a miss. `GREENROOM_CACHE=0` turns it off and `GREENROOM_CACHE_DIR` moves it. The CLI no longer scans the working tree before dispatch for commands that never read that scan, and `check` used to scan the head twice. Measured on apex-nexus against the same master: 38 to 42 s wall and 36 to 40 CPU-s before, 31 s and 28 CPU-s with an empty cache, 12 s and 12 CPU-s warm. The JSON verdict (fresh, resolved, waived, expired waivers, reference label, exit code) was identical in all three runs.
- compare: on APFS the base tree is cloned from the checkout (`cp -c`) and only paths that differ from the base commit are written from git objects; anything unexpected falls back to `git worktree add`. Measured on an isolated APFS volume with an apex-nexus checkout (14.5k files, 5 changed files): 198 MB written per check before, 5.6 to 6.1 MB after, 6.2 to 9.2 s to the tree before, 4.2 to 4.9 s after. `GREENROOM_COMPARE_CLONE=0` keeps the checkout.
- compare: the cloned tree is proven before it is scanned. After the clone, git reads the index, the unstaged changes and the untracked entries again and they must match the first readings byte for byte, and the tree's paths must be exactly the base commit's blobs plus an empty directory per gitlink. A lane writing into the checkout mid-clone (which leaked into the base tree and read as clean) now falls back to `git worktree add`. Cost on the apex-nexus checkout at load 147: 0.23 s of git readings, 0.47 s for the walk.
- registry: removing an entry whose every canonical path is absent from the tree and tombstoned (`.greenroom/tombstones/*.json` or `.greenroom/tombstones.json`) is a retirement, not `policy/registry-changed`, on both the branch and the baseline-hash path. Removing an entry whose canonical is still live still raises it.
- ratchet: a duplicate cluster that lost a file is cleanup, not new entropy.
- scripts/chain: a shared basename is not the same file.

## 1.0.0 — 2026-09-17

Initial production release of Green Room.

- branch-aware anti-entropy ratchet that prevents cleaned legacy violations from returning
- deterministic dependency-cycle, script-chain, duplicate, naming, wrapper, design-system, and registry checks
- strict brownfield adoption baseline
- canonical responsibility/component registry and task-aware doctor
- bounded cleanup campaign and next-batch output
- protected policy, baseline, waiver, registry, managed agent rules, skill, and CI gate
- human-governed exact-ID waivers with expiry
- fail-closed policy/registry/baseline parsing and validation
- managed AGENTS.md / CLAUDE.md injection that preserves project-owned instructions
- dependency-free runtime core
- packed-consumer smoke test and 4,000-file synthetic benchmark
- normalized evidence-provider contract with Fallow, optional Knip, and project-native graph/runtime evidence
- real-provider CI contract pins Fallow and Knip separately and requires corroborated reachability evidence
- responsibility-level canonical ownership, caller/directory boundaries, replacement history, and generated-artifact relationships
- stranded-feature detection for implemented/tested code that is not production-reachable
- competing-responsibility and script-junk-drawer detection
- corroboration model that keeps conflicting evidence visible and prevents one weak oracle from authorizing deletion
- transaction-style cleanup campaigns with approval, behavior-preservation checks, verification, and ratchet delta
- generated-artifact registry and mess-budget enforcement
- optional OpenSpec export for behavior-preserving cleanup campaigns
- explicit cross-platform governance-release verification that preserves all tests and only authorizes the final governance gate
