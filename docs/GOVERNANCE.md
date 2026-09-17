# Governance

Green Room distinguishes **code work** from **rule-changing work**.

## Routine feature / bugfix PR

Allowed:

- edit canonical production code
- delete obsolete code
- migrate callers
- improve tests
- reduce existing violations

Not allowed:

- weaken `.greenroom.json`
- replace `.greenroom/baseline.json`
- add a waiver
- redefine canonical registry ownership
- rewrite/remove the managed Green Room instructions, skill, or gate

If a routine PR needs one of those actions merely to pass, the code change is not finished.

## Governance PR

Use a governance PR for a real architecture/policy decision.

1. Human reviews the reason.
2. Temporarily set repository Actions variable `GREENROOM_ALLOW_GOVERNANCE_UPDATE=1`.
3. Make the policy / registry / waiver change.
4. If governance hashes or accepted debt change, refresh intentionally:

```bash
npx greenroom baseline --force --reason="short human-readable reason"
```

5. Review `.greenroom/governance.jsonl` when present.
6. Merge the governance PR.
7. Remove `GREENROOM_ALLOW_GOVERNANCE_UPDATE`.

The variable is intentionally coarse and powerful. Do not leave it enabled.

## Waivers

A waiver targets one exact violation ID and requires a reason.

```bash
npx greenroom waive <id> \
  --reason="external SDK requires this compatibility facade" \
  --owner="platform" \
  --expires=2026-12-31
```

Expired waivers become blocking violations. A waiver file change is itself governance-protected.

Prefer fixing the code or encoding a narrow deterministic allow rule when the exception is permanent and structurally describable.
