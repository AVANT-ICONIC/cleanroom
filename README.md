# Green Room

**Green Room is a deterministic anti-entropy guardrail for agent-heavy codebases.**

It exists for the repository that still “works” after weeks of AI coding but now contains five launchers, twelve fix scripts, duplicate UI primitives, wrapper-on-wrapper abstractions, raw style values, and enough navigation noise that every new agent makes the next mistake faster.

Green Room does not ask an agent to *remember* to be clean. It makes repository cleanliness testable and merge-blocking.

```text
                 human + coding agents
                         |
                         v
                greenroom doctor
                         |
                         v
                    code change
                         |
          +--------------+--------------+
          |                             |
          v                             v
     repo tests                    greenroom check
                                        |
                              +---------+---------+
                              |                   |
                            PASS                BLOCK
                              |                   |
                              v                   v
                            merge          remove new entropy
```

## What Green Room enforces

Built-in checks cover:

- dependency cycles in JavaScript / TypeScript local imports
- script-to-script imports and invocations
- npm/pnpm/yarn package-script chains, including workspace packages
- exact duplicate files and repeated code blocks
- suspicious `fix`, `final`, `new`, `old`, `copy`, `tmp`, `v2`-style source filenames
- needless non-index re-export wrappers
- raw UI colors, spacing, radii, typography values, and `!important` outside configured token files
- missing or conflicting canonical registry entries
- duplicate exact-name design-system primitives outside the registered canonical path
- deletion or rewriting of Green Room's managed agent rules, skill, or CI gate
- policy, baseline, waiver, and canonical-registry tampering after adoption
- expired waivers
- tested-but-production-unreachable (stranded) implementations
- competing `fix`/`repair`/parallel responsibility candidates
- generated-artifact missing/staleness evidence
- unowned scripts when ownership enforcement is enabled

The core scanner is dependency-free at runtime. It uses Node.js and Git only. Optional Fallow, Knip, and project-native graph/runtime evidence can be normalized behind the same provider contract; no external provider gets mutation authority.

## The ratchet

A brownfield repository may already contain hundreds of violations. Green Room does **not** demand a reckless one-shot rewrite.

At adoption, those existing violations are recorded once. After that, pull requests are compared against the **actual target branch**, not merely the original baseline.

```text
adoption:        500 violations   allowed as legacy debt
later cleanup:   300 violations   passes
next feature:    300 violations   passes
regression:      301 violations   blocked
```

Once one of the original 500 violations disappears from the target branch, reintroducing the same violation is blocked. The baseline cannot permanently resurrect old garbage.

## Install

Green Room is currently distributed from this repository. The `stable` branch is the tested consumer target.

```bash
npm install --save-dev github:AVANT-ICONIC/cleanroom#stable
```

Requires Node.js 20+ and Git for branch-aware comparison.

### New repository

```bash
npx greenroom init
npx greenroom doctor "build provider startup"
# implement
npx greenroom check
```

Greenfield initialization refuses to silently grandfather violations. If code already exists and the first audit is dirty, fix it or explicitly adopt as brownfield.

### Existing messy repository

```bash
npx greenroom init --existing
npx greenroom audit

# tune .greenroom.json and register known canonical paths first
npx greenroom register responsibility provider-startup src/providers/ProviderLauncher.ts --alias="launch provider,start provider"
npx greenroom register component card src/components/ui/Card.tsx --alias="panel"

# review once, then freeze the starting mess
npx greenroom baseline

# generate a bounded cleanup campaign
npx greenroom clean
npx greenroom next

# normal feature work
npx greenroom doctor "fix provider startup"
npx greenroom check
```

`greenroom clean` never auto-refactors source code. It generates bounded cleanup batches with affected files, exact violation IDs, a goal, and definition of done. Blind autonomous repository rewrites are intentionally not a feature.

## Core commands

```text
greenroom init [--existing] [--baseline]
greenroom audit [--provider=fallow|knip|project-native] [--json]
greenroom providers [--provider=fallow|knip|project-native] [--json]
greenroom baseline [--force --reason="..."]
greenroom check [--against=<git-ref>] [--json]
greenroom doctor "task" [--json]
greenroom find "query" [--json]
greenroom explain <finding-id> [--json]
greenroom responsibility list [--json]
greenroom responsibility show <id> [--json]
greenroom register <responsibility|component> <name> <path> [--alias=a,b] [--owner=x]
greenroom clean [--batch-size=12] [--json]
greenroom cleanup approve <campaign-id> --owner=x --reason="..." [--canonical=path|none]
greenroom cleanup verify <campaign-id> [--json]
greenroom cleanup openspec <campaign-id> [--name=change-name] [--no-validate]
greenroom next [--batch-size=12] [--json]
greenroom waive <violation-id> --reason="..." --owner=name --expires=YYYY-MM-DD
greenroom unwaive <violation-id>
greenroom version
```

Exit codes are stable for automation:

- `0` success / gate pass
- `1` new entropy blocked
- `2` invalid usage, invalid policy, or missing adoption baseline

## Canonical registry

`.greenroom/registry.json` tells humans and agents where responsibilities and design primitives actually live.

```json
{
  "version": 1,
  "responsibilities": {
    "provider-startup": {
      "canonical": "src/providers/ProviderLauncher.ts",
      "aliases": ["launch provider", "start provider"]
    }
  },
  "components": {
    "card": {
      "canonical": "src/components/ui/Card.tsx",
      "aliases": ["panel"]
    }
  }
}
```

`greenroom doctor` uses the registry plus filenames, content, callers, dependencies, and nearby violations to point the agent at the existing implementation before it creates another one. The registry can also hold production entrypoints, tests/docs, generated artifacts, replacement history, caller/directory boundaries, and forbidden recreation patterns.

After adoption, registry changes are governance changes. A feature agent cannot simply delete the `card` registration to make its shiny new `Card.tsx` look legitimate.

## Design-system enforcement

The default policy treats these as token files:

```text
src/styles/tokens.css
src/design/tokens.css
src/styles/theme.css
app/globals.css
```

Raw design values elsewhere are blocked by default. Tune the token paths and permitted files in `.greenroom.json` before the brownfield baseline.

This is intentionally stricter than a prettier. Green Room cares whether the repository has **one design language**, not whether twelve incompatible values are formatted beautifully.

## Optional OpenSpec pairing

OpenSpec is useful for **planning and reviewing a cleanup**, not for detecting the mess. Green Room can export one behavior-preserving cleanup campaign into an existing OpenSpec project:

```bash
greenroom cleanup openspec <campaign-id>
```

The generated change uses OpenSpec's pure-refactor shape (`skip_specs: true`) and contains proposal/design/tasks sourced from the Green Room campaign. If the OpenSpec CLI is installed, Green Room validates the generated change. If product behavior changes, use normal OpenSpec delta specs instead of this shortcut.

See [OpenSpec integration](docs/OPENSPEC.md).

## Human governance

These surfaces are protected after adoption:

```text
.greenroom.json
.greenroom/baseline.json
.greenroom/waivers.json
.greenroom/registry.json
managed Green Room block inside AGENTS.md / CLAUDE.md
.greenroom/skills/repo-hygiene/SKILL.md
Green Room CI gate
```

A legitimate governance change uses a dedicated PR. Temporarily set the repository Actions variable:

```text
GREENROOM_ALLOW_GOVERNANCE_UPDATE=1
```

Make the policy/registry/waiver change, intentionally refresh the baseline when required:

```bash
npx greenroom baseline --force --reason="approved design-system architecture change"
```

Merge the governance PR, then remove the variable again.

Do **not** set this variable for ordinary feature PRs.

## CI

`greenroom init` writes `.github/workflows/green-room.yml`. It checks out full history and compares:

- pull requests against the real base branch
- pushes to `main`/`master` against the pre-push commit

Then configure your GitHub branch/ruleset so this status check is required:

```text
Green Room / entropy-gate
```

The generated workflow installs Green Room from `AVANT-ICONIC/cleanroom#stable`. If this repository remains private, the consumer repository's Actions runner needs credentials that can read it. Making Green Room public removes that cross-private-repository authentication problem.

## Agent integration

Initialization safely injects a managed Green Room block into existing `AGENTS.md` and `CLAUDE.md` without deleting project-specific instructions, and installs:

```text
.greenroom/skills/repo-hygiene/SKILL.md
```

The CLI is intentionally the agent contract. Any coding agent that can run shell commands can use the same deterministic `doctor`, `audit`, `next`, and `check` interface. Green Room does not require an MCP server to enforce correctness, so losing an MCP connection cannot disable the gate.

## Configuration

Policy lives in `.greenroom.json`. Important knobs include:

- source/script roots and entrypoints
- ignored directories and glob patterns
- maximum scanned file size
- duplicate block size
- legitimate script orchestration edges
- naming exceptions
- design roots/token files/exceptions
- optional unreachable-file analysis
- deliberate wrapper exceptions
- managed-file enforcement
- entropy weights

Invalid JSON and unknown rule names fail closed instead of silently falling back to weaker defaults.

See [Policy reference](docs/POLICY.md), [Brownfield adoption](docs/ADOPTION.md), [Architecture](docs/ARCHITECTURE.md), [Governance](docs/GOVERNANCE.md), [Evidence providers](docs/PROVIDERS.md), and [OpenSpec integration](docs/OPENSPEC.md).

## Scope

Green Room is deliberately not a magical architecture oracle.

It does **not**:

- auto-refactor an entire repository
- decide business architecture for you
- prove semantic equivalence between near-duplicate implementations
- replace tests, typechecking, build validation, or runtime/visual testing
- claim JavaScript import-graph analysis covers language-server semantics for every language

It does something narrower and more dependable: it turns recurring repository-hygiene failures into deterministic evidence, guides agents toward canonical paths, and prevents newly measurable entropy from quietly landing.

```text
predictable > clever
one canonical path > parallel implementations
delete > permanent compatibility debris
constraints > reminders
ratchet > rewrite
```

Licensed under the **GNU Affero General Public License v3.0** — the same terms as
[ShipGate](https://github.com/AVANT-ICONIC/shipgate-cli), which Green Room is
designed to run alongside.

Green Room exists to keep codebases open to inspection. The AGPL keeps Green Room
itself open the same way, including when it is offered as a hosted service.
