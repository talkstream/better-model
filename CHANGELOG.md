# Changelog

## [0.6.0] - 2026-04-24

### Opus 4.7 matrix refresh

- **Tier 3 reference model is now Opus 4.7** (released April 16, 2026) with refreshed benchmarks:
  - SWE-bench Verified **87.6%** (Sonnet 4.6: 79.6%; gap widened to 8.0 pts)
  - SWE-bench Pro **64.3%** (+10.9 pts vs Opus 4.6)
  - GPQA Diamond **94.2%** (gap to Sonnet 4.6: 20.1 pts)
  - Terminal-Bench 2.0 **69.4%**, MCP-Atlas **77.3%** (agentic tool use)
- **New effort level `xhigh`** (Opus 4.7 only) — now the default for Tier-3 agentic coding: multi-file refactoring, code review, migrations, cross-file debugging. Anthropic's recommended starting point for Opus 4.7 coding and agentic work.
- **`max` reserved** for architecture design, security audits, and novel algorithm design only. Anthropic warns that `max` can overthink on structured-output tasks — `xhigh` is the safer default for code review.
- **Long-context warning**: Opus 4.7 has a documented lost-in-the-middle regression past ~500K tokens; prefer Sonnet 4.6 or chunking.
- **Tokenizer caveat**: Opus 4.7 uses a new tokenizer producing 1.0–1.35× tokens vs Opus 4.6; effective cost on long prompts may rise up to ~35%.

### Inference engine (`src/fix.js`)

- Opus keyword list split into two tiers:
  - **max** (frontier reasoning): `architect`, `security`, `novel`, `algorithm`
  - **xhigh** (agentic coding): `audit`, `migrate`, `migration`, `migrator`, `review`
- Previous v0.5.x behaviour was a single `opus/high` bucket that produced shallow reasoning on Opus 4.7 (which respects `high` more strictly than 4.6).

### Routing block (`src/init.js`)

- CLAUDE.md routing block updated with `opus/xhigh` and `opus/max` mappings and a long-context warning.
- **New `BLOCK_VERSION_MARKER`** — every routing block now carries `<!-- better-model block version: 0.6 -->` so future upgrades can detect stale blocks unambiguously (not by incidental content).
- **New `isStaleRoutingBlock(content)`** — returns `true` when both markers are present but the block lacks the current version marker.
- `init` detects v0.5.x blocks in both installed and fresh-install paths and replaces them in place, preserving user content above and below.

### Agents (`src/agents.js`)

- `sonnet-coder` escalation instruction now tells the parent agent exactly which Opus 4.7 effort level to use (`xhigh` for most Tier-3 work, `max` for architecture/security/novel algorithms).
- Frontmatter unchanged: `sonnet-coder` remains `model: sonnet, effort: medium`; `haiku-explorer` remains `model: haiku, effort: low`.

### Upgrade path

- `npx better-model@latest init` on a v0.5.x project auto-upgrades the routing block to v0.6 — no `reset` required.
- `npx better-model@latest init` on a v0.4.x project still upgrades the single-line reference to a full v0.6 routing block in one step.
- `reset` unchanged — still cleanly removes everything installed by better-model.

### Tests

- Total test count: **102** (up from 68 in v0.5.1; +34 new tests).
- Inference engine: 23 new tests across Haiku/OpusMax/OpusXhigh/SonnetHigh/SonnetMedium tiers, priority ordering, and reason annotations.
- Routing block detection and upgrade: 14 new tests for `isStaleRoutingBlock`, v0.5→v0.6 upgrade in both install branches, idempotency, content preservation.

### Sources

- [Anthropic Opus 4.7 announcement](https://www.anthropic.com/news/claude-opus-4-7)
- [Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)
- [CodeRabbit Opus 4.7 code review study](https://www.coderabbit.ai/blog/claude-opus-4-7-for-ai-code-review)
- [Claude Code CLI v2.1.111 changelog](https://code.claude.com/docs/en/changelog) — `xhigh` support shipped April 16, 2026

## [0.5.1] - 2026-04-07

### Fixed
- **Auto-upgrade**: `init` on v0.4.0 projects now upgrades the single-line CLAUDE.md reference to the routing block automatically — no `reset` needed

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
