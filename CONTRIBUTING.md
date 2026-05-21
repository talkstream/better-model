# Contributing to better-model

Thank you for your interest in improving better-model.

## Updating the decision matrix

The decision matrix in `templates/BETTER-MODEL.md` is the core of this project. If you have new benchmark data, published studies, or documented failure cases that should inform the matrix, please open an issue or pull request with:

1. **The claim** — what should change in the matrix
2. **The evidence** — link to benchmark results, published study, or reproducible example
3. **The impact** — which tier/task/rule is affected

Anecdotal reports are welcome as supporting evidence but are not sufficient on their own to change the matrix.

## Profiles

A *profile* (introduced in v0.10.0) is an opt-in keyword overlay applied on top of the base inference engine — see [`templates/profiles/`](templates/profiles/) for shipped profiles.

Proposing a new profile or change requires:

1. **The domain** — a clearly delimited problem area (e.g. one language ecosystem, not "web apps in general").
2. **The evidence** — at least one published benchmark or reproducible measurement showing the domain's coding tasks deserve a different tier than the base routing implies. We are skeptical of profiles by default — see the v0.10.0 README "Why blockchain is the only profile (for now)" for the bar.
3. **The keyword set** — distinctive vocabulary with low false-positive risk. Short keywords (≤4 chars) that substring-match common English (`func`, `tact`) require word-boundary regex matching + an FP regression test.
4. **The framing** — profiles that lack head-to-head efficacy measurements ship as "convenience presets" without efficiency claims, per the v0.10.0 `blockchain` precedent.

Profiles that fail the FP regression suite or that demote any existing tier are rejected by CI — `inferModel`'s additivity invariant is enforced by `test/fix.test.js`.

Maintenance: profile keyword tables are reviewed each minor release alongside the main inference engine. A profile whose evidence base weakens (benchmark withdrawn, Anthropic guidance contradicts it) is sunset in the next minor release with a deprecation warning in `init` output, leaving user files untouched per the `reset` invariant.

## Development

```bash
# Clone the repository
git clone https://github.com/talkstream/better-model.git
cd better-model

# Run tests
node --test 'test/*.test.js'

# Test the CLI locally
node bin/better-model.js --help
```

### Project principles

- **Zero dependencies** — only Node.js built-ins
- **Evidence-based** — every matrix entry needs published data
- **Idempotent** — `init` and `reset` are safe to run multiple times
- **Minimal footprint** — one `.md` template + routing block + optional agents

### Running tests

Tests use the Node.js built-in test runner (`node:test`). No external test framework required.

```bash
node --test 'test/*.test.js'
```

## Code of conduct

Be kind. Be constructive. Back claims with evidence.
