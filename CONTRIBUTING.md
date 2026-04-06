# Contributing to better-model

Thank you for your interest in improving better-model.

## Updating the decision matrix

The decision matrix in `templates/BETTER-MODEL.md` is the core of this project. If you have new benchmark data, published studies, or documented failure cases that should inform the matrix, please open an issue or pull request with:

1. **The claim** — what should change in the matrix
2. **The evidence** — link to benchmark results, published study, or reproducible example
3. **The impact** — which tier/task/rule is affected

Anecdotal reports are welcome as supporting evidence but are not sufficient on their own to change the matrix.

## Development

```bash
# Clone the repository
git clone https://github.com/talkstream/better-model.git
cd better-model

# Run tests
node --test test/detect.test.js test/init.test.js test/reset.test.js

# Test the CLI locally
node bin/better-model.js --help
```

### Project principles

- **Zero dependencies** — only Node.js built-ins
- **Evidence-based** — every matrix entry needs published data
- **Idempotent** — `init` and `reset` are safe to run multiple times
- **Minimal footprint** — one `.md` file + one reference line

### Running tests

Tests use the Node.js built-in test runner (`node:test`). No external test framework required.

```bash
node --test test/detect.test.js test/init.test.js test/reset.test.js
```

## Code of conduct

Be kind. Be constructive. Back claims with evidence.
