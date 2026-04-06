# Changelog

## [0.3.0] - 2026-04-07

### Added
- **Enforcement mode** (default) — `init` now injects `model:` and `effort:` frontmatter into `.claude/agents/` and `.claude/skills/`
- **Soft mode** — `init --soft` for reference-only installation (previous behavior)
- **`audit --fix`** — auto-inject model frontmatter post-install
- Inference engine maps agent names/descriptions to model tiers (Haiku/Sonnet/Opus)
- Skips agents that already have `model:` set
- Skips skills that delegate to agents with `model:` set

### Field-tested
- platonmamatov.com: correctly inferred 8/8 agents and skills
- Claude Code session proactively applied matrix from soft mode (no `--fix` needed)

## [0.2.0] - 2026-04-07

### Added
- **`audit` command** — scan `.claude/agents/` and `.claude/skills/` for missing model settings
- Agent Frontmatter Examples section in decision matrix template
- Session Model Guidance section (when to suggest `/model sonnet`)
- `init` now prints next steps: `git add` reminder + `audit` suggestion

## [0.1.1] - 2026-04-07

### Changed
- Honest speed claims based on deep research (Artificial Analysis benchmarks)
- Replaced unverified tok/s numbers with relative speed and rate limits
- Added "~30% average, up to 40%" based on weighted TTFT + throughput
- Updated package.json description

## [0.1.0] - 2026-04-07

### Added
- Initial release
- Decision matrix with 3-tier model routing (Haiku/Sonnet/Opus)
- CLI commands: `init`, `reset`, `status`
- Evidence-based routing from SWE-bench, GPQA Diamond, ARC-AGI-2, SonarSource, CodeRabbit
- Zero dependencies — Node.js built-ins only
- 23 tests (node:test)
