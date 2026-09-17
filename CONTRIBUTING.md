# Contributing

Green Room changes must make the guard more trustworthy without turning it into another sprawling framework.

Before opening a pull request:

```bash
npm ci
npm run verify
```

Principles:

- deterministic evidence over model judgment
- fail closed on malformed governance data
- stable violation identities
- bounded cleanup over blind rewrites
- no runtime dependency unless the capability clearly justifies the supply-chain and maintenance cost
- every bug fix needs a regression test
- every new rule needs a low-noise escape hatch for legitimate architecture

Do not weaken a test merely because a new implementation makes it inconvenient.
