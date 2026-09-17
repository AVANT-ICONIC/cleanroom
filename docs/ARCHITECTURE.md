# Architecture

Green Room is a repository anti-entropy **control plane**, not a homegrown replacement for every static analyzer.

```text
            built-in analyzers   external providers   project evidence
                    \                 |                 /
                     \                |                /
                      +------ normalized evidence -----+
                                      |
                              responsibility map
                                      |
                   canonical / competing / stranded / stale
                                      |
                              cleanup campaign
                                      |
                         verify -> mutate -> prove
                                      |
                           target-branch ratchet
```

The design separates the following concerns so the hygiene system does not become another pile of scripts fixing scripts.

## 1. Policy

`.greenroom.json` defines deterministic repository invariants and scanner configuration.

The policy parser fails closed on malformed JSON, unsafe configured paths, unknown rule keys, or invalid values.

## 2. Built-in violations

Built-in analyzers can emit merge-blocking violations when Green Room has deterministic local proof, for example:

```json
{
  "id": "stable-identity",
  "rule": "scripts/chain",
  "paths": ["scripts/a.ts", "scripts/b.ts"],
  "message": "human-readable evidence",
  "detail": "stable machine identity detail"
}
```

Violation IDs are content/structure derived where practical so harmless line movement does not continually invent new identities.

## 3. Evidence providers

External tools are **oracles, never authorities**.

Current provider contract:

```text
Fallow          -> JS/TS reachability, duplication, architecture, health evidence
Knip            -> optional corroborating reachability/dependency evidence
project-native  -> graph/runtime/project evidence supplied as JSON
```

Provider output is normalized into Green Room findings before policy or cleanup uses it. Provider disagreements remain visible. One textual/name-based detector cannot authorize deletion.

The project-native provider is how tools such as Graft can feed caller/blast-radius evidence into Green Room without hard-wiring Apex-specific code into the standalone product.

## 4. Responsibility map

Files are too low-level to describe ownership. `.greenroom/registry.json` can model repository responsibilities with:

- canonical implementation(s)
- owner/status/aliases
- production entrypoints
- tests/docs
- generated artifacts
- replacement history
- allowed callers/directories
- forbidden recreation patterns
- cleanup history

Brownfield repositories may begin with unknown canonicality. Green Room helps surface competing candidates; it does not pretend uncertainty is certainty.

## 5. Corroboration and deletion safety

Cleanup candidates are evidence, not delete buttons.

Deletion-sensitive work follows the campaign state model:

```text
DETECTED
  -> CORROBORATED
  -> BLAST_RADIUS_MAPPED
  -> CANONICALITY_CHECKED
  -> BEHAVIOR_PRESERVATION_CHECKED
  -> CLEANUP_PLAN_READY
  -> APPROVED
  -> MUTATED_IN_ISOLATION
  -> VERIFIED
  -> RATCHET_UPDATED
```

Tests-only reachability is distinct from production reachability. A feature can therefore be "implemented + tested + never wired" and still be surfaced as stranded.

## 6. Cleanup campaigns

`greenroom clean` / `greenroom cleanup plan` create bounded transaction artifacts. They record:

- base commit
- target violations/findings
- paths and callers-before
- canonical decision
- behavior that must survive
- planned mutations
- approval state
- repository verification commands
- expected ratchet delta

`greenroom cleanup verify` re-scans the repository, requires target findings to disappear, enforces approval for destructive campaigns, runs the detected repository checks, and runs the Green Room gate.

Green Room deliberately does not auto-refactor an entire repository.

## 7. Generated-artifact governance

Generated files can be explicitly registered with canonical sources and a regeneration command. Green Room distinguishes missing generated output from timestamp-based staleness evidence. Timestamp staleness is advisory; a missing declared artifact is deterministic.

## 8. Ratchet

The adoption baseline records the brownfield starting state plus governance hashes.

For routine Git work, `greenroom check` prefers the actual comparison ref:

```text
working tree / HEAD       -> compare current state to Git-derived reference
feature branch            -> compare against merge-base/default branch
pull request CI           -> compare against origin/<base branch>
push CI                   -> compare against github.event.before
fallback/no Git history   -> compare against adoption baseline
```

This prevents the classic baseline flaw where legacy debt could be removed and later reintroduced because the original adoption baseline still remembered it as grandfathered.

## 9. Governance trust boundary

Policy, baseline, waivers, canonical registry, generated registry, and managed agent/CI files form the trust boundary.

Routine changes cannot alter them to make a failure disappear. Explicit governance mode exists for deliberate human-approved changes.

## 10. Agent guidance

The canonical registry, `doctor`, generated agent rules, hygiene skill, and bounded cleanup plans help an agent satisfy policy without guessing.

Guidance never substitutes for `greenroom check`.

## 11. Optional OpenSpec bridge

OpenSpec can record an approved behavior-preserving cleanup as proposal/design/tasks while Green Room remains the detector and ratchet authority. See [OpenSpec integration](OPENSPEC.md).

## Dependency philosophy

The Green Room runtime core has no npm dependencies. It uses Node.js built-ins and Git for branch comparison. External analyzers are discovered at runtime and remain optional.

This reduces supply-chain surface and avoids making repository hygiene depend on a large dependency tree.
