# Brownfield Adoption

Green Room is designed to enter an already messy repository without freezing development or demanding a dangerous full rewrite.

## 1. Install and initialize

```bash
npm install --save-dev github:AVANT-ICONIC/cleanroom#stable
npx greenroom init --existing
```

Brownfield mode intentionally does **not** create a baseline yet.

## 2. Tune policy before freezing reality

Review `.greenroom.json` for:

- real source and script roots
- ignored generated/vendor paths
- design-token files and design exceptions
- legitimate script orchestration edges
- intentional wrapper facades
- entrypoints if unreachable-file analysis is enabled

Run repeatedly:

```bash
npx greenroom audit
```

The goal is not to hide debt. The goal is to remove false positives so the remaining violations describe actual debt.

## 3. Register canonical architecture

Register the important responsibilities and UI primitives that agents repeatedly reinvent:

```bash
npx greenroom register responsibility provider-startup src/providers/ProviderLauncher.ts --alias="launch provider,start provider"
npx greenroom register component card src/components/ui/Card.tsx --alias="panel"
```

Do this before the initial baseline. Registry changes become governance changes afterward.

## 4. Freeze the adoption baseline

```bash
npx greenroom baseline
```

Commit `.greenroom.json`, `.greenroom/`, managed agent instructions, and the generated workflow together.

## 5. Require the CI gate

Require this GitHub status check in the default-branch ruleset:

```text
Green Room / entropy-gate
```

This matters. Agent instructions are guidance; the required check is enforcement.

## 6. Generate the cleanup campaign

```bash
npx greenroom clean
npx greenroom next
```

Work one bounded batch at a time. A cleanup batch is done only when:

1. the target violations disappear,
2. callers use the canonical implementation,
3. superseded files are deleted,
4. project validation passes,
5. `greenroom check` passes.

## 7. Never routinely re-baseline

The adoption baseline exists to grandfather the starting mess once. Normal feature work must not refresh it.

Green Room compares later PRs to the actual target branch, so removed legacy debt cannot quietly return even though it existed at adoption.
