# Policy Reference

Green Room policy is JSON at `.greenroom.json`.

## Repository discovery

- `sourceRoots`: roots used for repository source analysis.
- `scriptRoots`: directories whose source files are treated as scripts.
- `entrypoints`: declared production import-graph roots.
- `ignore`: directory names skipped anywhere in traversal.
- `ignorePatterns`: glob-like path patterns (`*`, `**`, `?`) skipped during traversal.
- `maxFileBytes`: source files larger than this are skipped.
- `defaultBranches`: branch names used for local comparison inference.

## Rules

Boolean switches under `rules`:

- `suspiciousFilenames`
- `duplicateFiles`
- `duplicateBlocks`
- `dependencyCycles`
- `unreachableSourceFiles`
- `scriptChains`
- `scriptJunkDrawer`
- `rawDesignValues`
- `canonicalRegistry`
- `trivialWrappers`
- `strandedFeatures`
- `competingResponsibilities`
- `generatedArtifacts`
- `unownedScripts`
- `managedFiles`

Unknown rule names are rejected. A typo must never silently disable enforcement.

## Duplicate blocks

```json
{
  "duplicateBlocks": {
    "minLines": 8,
    "minOccurrences": 2,
    "ignorePatterns": ["**/*.test.*", "**/*.spec.*"]
  }
}
```

## Naming

`naming.allow` accepts path patterns for intentional names that would otherwise match `fix`, `final`, `copy`, `tmp`, `v2`, etc.

## Architecture

- `architecture.allowTrivialWrappers`: allowed deliberate facade/re-export modules. `index.*` barrels are excluded automatically.
- `architecture.testPatterns`: paths classified as test-only reachability.
- `architecture.excludeFromStranded`: files that must not become stranded-feature candidates.

## Design

- `roots`: paths where design checks run.
- `tokenFiles`: files allowed to declare raw design values.
- `allow`: additional path exceptions.
- `forbidRawColors`
- `forbidRawRadius`
- `forbidRawSpacing`
- `forbidRawTypography`
- `forbidImportant`

## Scripts

- `allowScriptImports`: exact `from->to` file edges permitted between script files.
- `allowPackageChains`: exact `script->script` package-script edges, or `path/to/package.json:script->script` for one workspace package.
- `allowLifecycleHooks`: permits matching npm-style `pre<name>` / `post<name>` hooks.
- `requireOwnership`: requires governed scripts to map to a registered responsibility.

## Evidence providers

```json
{
  "providers": {
    "fallow": { "enabled": true, "command": "", "timeoutMs": 120000 },
    "knip": { "enabled": false, "command": "", "timeoutMs": 120000 },
    "projectNative": { "enabled": true, "directory": ".greenroom/evidence" }
  }
}
```

Fallow is the primary optional JS/TS evidence source. Knip is disabled by default and is intended only when a repository demonstrates complementary reachability/dependency value. Project-native evidence is a read-only interchange surface for graph/runtime tools.

Provider findings do not automatically become deletion authority.

## Budgets

`budgets` can set hard ceilings for supported violation/finding classes. This is useful for repositories that want explicit "mess budgets" in addition to exact target-branch regression blocking.

## Canonical registry

`registryFile` points at the responsibility/component registry. Registry changes after adoption are governance changes.

Responsibilities can declare ownership, canonical files, entrypoints, tests/docs, generated artifacts, replacement history, allowed callers/directories, forbidden patterns, and cleanup history.

## Generated artifacts

`generatedFile` points at the explicit generated-artifact registry. Missing declared outputs are deterministic violations. Timestamp-based stale evidence is advisory unless corroborated by a stronger project-specific check.

## Waivers

`waiversFile` stores exact violation waivers. A waiver requires an owner, reason, and expiry. Expired waivers become blocking violations.

## Managed files

`managed` controls the generated hygiene skill and CI gate. Exact enforcement is on by default for the managed agent block, skill, and generated workflow.

A repository with a deliberately custom CI workflow may set `managed.enforceWorkflowExact` to `false`; the workflow must still invoke `greenroom check`.

## Entropy weights

`entropyWeights` only affects reporting/prioritization. It does not make a new violation acceptable. The ratchet compares exact violation identities.

Changing policy after adoption is a governance action.
