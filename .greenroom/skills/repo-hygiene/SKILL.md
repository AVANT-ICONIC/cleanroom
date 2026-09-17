# Green Room Hygiene Skill

Use this procedure for every non-trivial repository change. Green Room exists to keep the repository predictable for humans and coding agents, not merely to make lint output green.

## Before coding
1. Run `greenroom doctor "<task>"`.
2. Identify the owning responsibility, canonical implementation, production entrypoints, callers, tests, generated artifacts, design primitives, and known replaced paths.
3. Search for competing implementations and existing utilities before creating anything.
4. Decide whether the task can be completed by changing, consolidating, moving, or deleting existing code. Creation is the last option.
5. Treat provider findings as evidence. One scanner saying "unused" is never enough to delete code.

## During coding
- Change the canonical implementation directly when safe.
- Keep one responsibility owned by one canonical path or explicitly declared set of paths.
- Migrate production callers in the same change; test-only reachability is not production wiring.
- Delete superseded code instead of leaving compatibility debris.
- Do not add fix/final/new/v2 copies to escape understanding existing code.
- Do not create scripts whose purpose is to patch or invoke other scripts unless that orchestration is explicitly owned and allowed by policy.
- Do not hand-edit generated outputs. Regenerate them from their registered sources.
- Do not invent parallel UI primitives or raw design values when the design system already owns the responsibility.
- Prefer one deep, coherent module over chains of shallow wrappers.
- Treat changes to Green Room policy, baseline, waivers, canonical registry, generated registry, or managed guard files as human governance work.

## Cleanup work
Use a Green Room cleanup campaign as a transaction. Progress from detection through corroboration, blast-radius mapping, canonicality, behavior preservation, isolated mutation, verification, and only then ratchet acceptance. Ambiguous deletion stays human-review-required.

## Before completion
1. Run the repository's tests, typecheck, build, and relevant runtime/visual validation where available.
2. Verify new behavior is reachable from the intended production root.
3. Run `greenroom check`.
4. If Green Room reports new entropy, fix the code. Do not re-baseline or weaken policy.
5. If a rule truly cannot apply, stop and request a human governance decision.
6. Use `greenroom cleanup plan` / `greenroom cleanup verify` for bounded cleanup work. Green Room plans and verifies cleanup; it does not blindly rewrite repositories.
