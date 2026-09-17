# Evidence providers

Green Room owns repository hygiene policy, canonicality, cleanup safety, and the ratchet. External analyzers are **read-only evidence providers**. They never receive deletion or refactor authority.

## Decision

### Fallow: primary JS/TS evidence provider

Fallow is enabled by default when its CLI is available. Green Room consumes its machine-readable findings for reachability, dead code, cycles, architecture boundaries, duplication, health/complexity, and styling/design-system signals.

Green Room does not copy Fallow's policy verdict. It normalizes the underlying findings into Green Room evidence and applies Green Room's own trust and cleanup rules.

### Knip: optional corroborating oracle

Knip remains disabled by default. It is intentionally **not** a second authority and is not a runtime dependency of Green Room.

Its value is narrower but complementary: framework-aware entrypoint and unused file/export/dependency reachability can corroborate deletion-sensitive findings from Fallow or project-native graph evidence. A disagreement increases uncertainty; it never becomes a majority vote for deletion.

This avoids paying the maintenance and noise cost of two mandatory overlapping scanners while retaining Knip where an adopter wants a second reachability oracle.

## Real contract benchmark

The `provider-contract` GitHub Actions job installs pinned provider versions separately from Green Room's package dependencies and runs both tools against the same intentionally dirty fixture.

The contract requires:

1. both CLIs are discoverable;
2. both adapters successfully parse their real JSON output;
3. both detect `src/dead.js` as production-unused;
4. Green Room retains both sources when it corroborates the finding.

Run the same check locally when the providers are installed:

```bash
npm run provider:integration
```

The core package stays dependency-light. Provider absence degrades to an explicit `unavailable` status rather than silently changing Green Room's authority model.

## Project-native evidence

Repositories can place versioned JSON evidence in `.greenroom/evidence/`. This is the integration seam for code graphs and project-specific knowledge such as Graft in Apex Nexus.

Project-native evidence is normalized through the same finding schema as Fallow and Knip. It does not bypass campaign approval, behavior-preservation checks, or the ratchet.

## Trust rule

```text
external tool says "unused"
          ↓
normalized evidence
          ↓
corroboration + responsibility map + callers
          ↓
cleanup campaign
          ↓
verification
          ↓
ratchet
```

One scanner result is evidence. It is not permission to delete code.
