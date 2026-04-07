# Changelog

## [0.5.0] - 2026-04-07

### Added
- **Custom agents**: `init` now creates `sonnet-coder.md` (model: sonnet) and `haiku-explorer.md` (model: haiku) in `.claude/agents/`
- **Routing block**: CLAUDE.md gets a `CRITICAL` directive block instead of a single reference line — instructs Claude to set `model` parameter on every Agent tool call
- **v0.4.0 migration**: `init` on v0.4.0 projects upgrades the single-line reference to the routing block automatically

### Changed
- **Code review → Opus**: `review` keyword moved from Sonnet-high to Opus-high tier in inference engine
- `reset` now removes better-model agents (identified by marker comment), preserves user agents
- `status` shows installed agents
- `parseFrontmatter()` exported from fix.js for reuse

### Field-tested
- 8 sessions, 3,194 API calls: identified Sonnet at 6.6% (target 60%) — agents + routing block address this gap
- Competitive analysis: claude-code-router (31.7k stars), Cursor Auto, Gemini CLI auto-routing

## [0.4.0] - 2026-04-07

### Added
- **Auto git-add**: `init` and `audit --fix` now automatically stage all created/modified files in git
- Solves the observed pattern where `.claude/` model configs and `docs/BETTER-MODEL.md` were forgotten across 3 consecutive commits in a real Claude Code session

### Changed
- `init` no longer prints "Next: git add..." when files are already staged
- `audit --fix` stages fixed files automatically

## [0.3.1] - 2026-04-07

### Changed
- README rewrite: "Stop waiting for Opus on every grep" tagline, badges, speed-first structure
- GitHub Actions CI (Node 18/20/22), issue templates, CHANGELOG, SECURITY.md
- npm keywords expanded to 15

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
