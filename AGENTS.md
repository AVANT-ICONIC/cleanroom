# AGENTS.md

<!-- GREEN-ROOM:BEGIN -->
## Green Room Repository Rules

This repository is protected by Green Room.

1. Search for the owning responsibility and canonical implementation before creating a file, component, helper, service, hook, script, style, or adapter.
2. Prefer changing the canonical implementation over creating a parallel implementation. If canonicality is unclear, investigate it instead of guessing.
3. When replacing behavior, migrate production callers and delete the superseded path in the same cleanup transaction.
4. Tests passing does not prove a feature is wired into production. Verify reachability from declared production entrypoints.
5. No single analyzer, textual match, or "unused" report authorizes deletion. Use corroborated evidence, blast-radius mapping, and behavior-preservation checks.
6. Do not add compatibility wrappers, fix/repair scripts, versioned copies, or duplicate components unless a real external compatibility requirement makes them necessary.
7. Generated artifacts are derived state: regenerate them from their declared source instead of hand-editing them into competing truth.
8. Use registered design-system components and tokens before inventing styling primitives. New canonical primitives are architecture decisions, not feature-task shortcuts.
9. Run `greenroom doctor "<task>"` before substantial implementation and `greenroom check` before declaring work complete.
10. Never re-baseline, weaken policy, rewrite the canonical registry, alter generated-governance declarations, or add a waiver merely to make a feature change pass. Those are human governance actions.

A feature merely working is not sufficient. It must be canonical, production-reachable, and no harder for the next agent to understand.
<!-- GREEN-ROOM:END -->
