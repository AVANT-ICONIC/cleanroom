# OpenSpec integration

Green Room and OpenSpec solve different parts of the same agent-coding failure mode.

```text
Green Room                              OpenSpec
----------                              --------
finds repository entropy                records agreed intent
maps canonical responsibility           records design decisions
corroborates cleanup evidence            records implementation tasks
blocks new entropy in CI                 verifies implementation vs artifacts
```

Green Room remains the hygiene authority. OpenSpec is an optional planning and review layer.

## Why the pairing is useful

A Green Room cleanup campaign answers:

- what looks duplicated, stranded, stale, or non-canonical;
- which files and callers are involved;
- what evidence supports the cleanup;
- whether destructive cleanup needs approval;
- what verification must pass;
- whether the repository ratchet improved afterward.

OpenSpec is useful once a cleanup is large enough that humans and agents should agree on the change before mutation. Its proposal/design/tasks workflow makes the cleanup contract reviewable and durable.

## Behavior-preserving cleanup

For a pure refactor or repository cleanup, externally visible behavior should not change. OpenSpec supports this with `skip_specs: true` on the change.

Green Room can export a cleanup campaign into that shape:

```bash
greenroom clean
greenroom cleanup openspec <campaign-id>
```

The repository must already be initialized for OpenSpec. Green Room deliberately does **not** install or initialize OpenSpec behind your back.

Generated change:

```text
openspec/changes/greenroom-<campaign-id>/
├── .openspec.yaml       # spec-driven + skip_specs: true
├── proposal.md          # why/what, sourced from Green Room campaign
├── design.md            # evidence, canonicality, risks, migration plan
└── tasks.md             # bounded implementation + Green Room verification
```

If the OpenSpec CLI is installed, Green Room runs strict validation after export. If validation fails, the generated change is removed instead of leaving invalid planning debris.

Use a custom name when useful:

```bash
greenroom cleanup openspec <campaign-id> --name=consolidate-provider-startup
```

Skip external validation only when necessary:

```bash
greenroom cleanup openspec <campaign-id> --no-validate
```

## If behavior changes

Do not use Green Room's automatic OpenSpec export as a shortcut when a cleanup changes user-visible or downstream behavior.

Instead:

1. create/update a normal OpenSpec change with real delta specs;
2. reference the Green Room finding/campaign IDs in the design/tasks;
3. perform the implementation;
4. finish with `greenroom cleanup verify <campaign-id>` and `greenroom check`.

Green Room will never invent fake requirements just to make an OpenSpec change validate.

## Why OpenSpec is not a Green Room dependency

OpenSpec does not detect repository entropy and Green Room does not need it to enforce the ratchet. Keeping the integration optional means:

- Green Room works in repositories that do not use spec-driven development;
- OpenSpec can evolve independently;
- CI hygiene cannot disappear because a planning tool is unavailable;
- teams can use another spec/change system while still consuming Green Room evidence.
