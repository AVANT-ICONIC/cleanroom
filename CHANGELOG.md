# Changelog

## 1.1.1 — unreleased

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
