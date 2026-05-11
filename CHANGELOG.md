# Changelog

## [0.7.1] - 2026-05-12

### README transparency centerpiece (user-requested)

- **New "How better-model decides — the algorithm, transparently" section.** The full keyword-to-tier decision tree printed inline, plus a link to [`src/fix.js:10-57`](src/fix.js). No abstraction; the routing logic is 50 lines and every word is readable.
- **New "What you gain — measured economics" section.** Three-row comparison table at a normalized 300K input + 1M output "task unit":
  - Vanilla Claude Code (Max default: Opus 4.7 + `high` effort): **~$47** / task, 87.6% quality, 1.0× baseline speed
  - Always Opus 4.7 + `max` effort: **~$122** / task, ~87.6% quality (may overthink), ~0.5× speed
  - **better-model routing** (Sonnet 55.6% / Opus 32.8% / Haiku 11.7%): **~$38** / task, ~82.6% quality, ~1.4× faster avg
  - Savings: **−18% vs Vanilla** and **−68% vs Always-max**
  - Methodology block lists every assumption (input/output split, tokenizer multiplier, effort multipliers, within-tier mix, routing distribution, quality blend method) plus a 20-line Python reproducer.
- Fixes stale Haiku-with-effort references throughout README (Tier 1 description, ready-to-use agents line, inference-engine summary).
- New "Upgrading from v0.6.x" subsection explaining the auto-upgrade path and the audit warning users see for stale `effort: low` on Haiku agents.

### Inference engine — three new keywords

- **`ultraplan` → opus + max.** Anthropic's cloud planning feature (Code with Claude 2026) — architectural-level work warrants frontier reasoning.
- **`orchestrate` / `orchestrator` → opus + xhigh.** Multi-agent orchestration pattern from Code with Claude 2026 (Netflix early adopter). Both listed explicitly: "orchestrate" does **not** subsume "orchestrator" by substring (final char differs, 'e' vs 'or'), same case as migrate/migration/migrator.
- **`advisor` → opus + xhigh.** "Advisor strategy" pattern: smaller model calls Opus for guidance, ~5× cost reduction with frontier-quality output (per May 6 Code with Claude 2026 event).

Note: `ultrareview` is intentionally NOT a new keyword — "review" subsumes it by substring.

### Matrix refresh (`templates/BETTER-MODEL.md`)

- **Long-context >500K split** into retrieval-heavy vs generation-heavy. Anthropic system card + community measurements (WentuoAI, GitHub issues #53234, #55504) confirm Opus 4.6 dominates 4.7 on multi-needle retrieval. The matrix now points retrieval workloads at **Opus 4.6** (still GA, not deprecated) and generation workloads at **Sonnet 4.6**.
- **Opus 4.7 tokenizer caveat expanded** with verbatim Anthropic pricing-docs quote: "up to 35% more tokens for the same fixed text." Practical: code-heavy prompts trend toward the 1.35× ceiling, prose stays near 1.0×, prompt caching (3× cheaper subagent writes since v2.1.133) partly offsets the cost.
- **New Tier-3 rows** matching the new keywords: multi-agent orchestration, Advisor strategy, architectural planning (ultraplan).
- **New "Other Claude Code routing primitives" section** documents complementary mechanisms that compose with better-model: `opusplan` alias, `${CLAUDE_EFFORT}` skill substitution (since v2.1.120), `CLAUDE_CODE_SUBAGENT_MODEL` env var, `task_budget` parameter (beta, header `task-budgets-2026-03-13`), hooks receiving `effort.level` (since v2.1.133). These recommend depth/budget; better-model recommends model.
- "Current Models at a Glance" heading bumped to "May 2026".

### Tests

- **126 tests** (was 119; +7 new):
  - Direct keyword matches for `ultraplan`, `orchestrate`, `orchestrator`, `advisor`
  - Substring coverage test confirming `ultrareview` matches via `review`
  - Substring coverage test confirming `multi-agent-orchestrator` matches via `orchestrator`
  - Priority test: `ultraplan-orchestrator` resolves to max (ultraplan max-tier outranks orchestrate xhigh-tier)
  - Explicit `migrator` keyword test (previously only `migrate` and `migration` had direct tests)

### Sources

- [Anthropic pricing docs](https://platform.claude.com/docs/en/about-claude/pricing) — verbatim tokenizer +35% claim
- [Anthropic April 23 postmortem](https://www.anthropic.com/engineering/april-23-postmortem)
- [Code with Claude 2026 announcements](https://simonwillison.net/2026/May/6/code-w-claude-2026/) — multi-agent orchestration, Outcomes, Dreaming, Advisor strategy
- [Claude Code changelog v2.1.118–v2.1.138](https://code.claude.com/docs/en/changelog) — `${CLAUDE_EFFORT}` substitution (v2.1.120), 3× subagent cache reduction (v2.1.133), hook `effort.level` (v2.1.133)

## [0.7.0] - 2026-05-12

### Haiku effort correctness fix

- **Removed `effort` injection on Haiku 4.5 agents.** Per [Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort), the `effort` parameter is supported only on Claude Sonnet 4.6, Opus 4.6, Opus 4.7 (and Opus 4.5 / Mythos Preview). Haiku 4.5 is **not** in that list. v0.6.x shipped `effort: low` in three places (inferModel Tier 1 return, `HAIKU_EXPLORER` frontmatter, the routing-block example); the field was silently ignored by the API. v0.7.0 omits it everywhere it is generated.
- The matrix at `templates/BETTER-MODEL.md` previously claimed "Haiku 4.5 does not support adaptive thinking; effort works via extended thinking in manual mode" — both halves were wrong. Replaced with a direct citation of the Anthropic effort docs and the rule "set `model: haiku` without `effort`".

### Routing block v0.7

- **Bumped `BLOCK_VERSION_MARKER` to `0.7`.** Existing v0.6 installs auto-upgrade on next `init` through the version-sentinel mechanism. The v0.5 → current and v0.4 → current paths continue to work; v0.6 → current is the new addition.
- ROUTING_BLOCK haiku bullet now reads `model: "haiku"` (no effort), with a parenthetical noting why.

### Inference engine (`src/fix.js`)

- `inferModel` Tier 1 returns `{ model: "haiku", reason }` without an `effort` field.
- **Latent bug fixed:** the injection guard in `fix()` previously read `if (effort && !fields.effort)` where `effort` was the option boolean (`true` by default) rather than the inferred value. With Tier 1 now returning no effort, the unguarded path would have written the literal string `"effort: undefined"` into user files. The guard now additionally checks `inferred.effort`. A regression test asserts the literal never appears in injected output.

### Audit (`src/audit.js`)

- **New ⚠ branch** when an agent has `model: haiku` and any `effort` field: `model=haiku, effort=low (ignored — Haiku 4.5 does not support effort)`. Increments the issues counter so the failure summary is reached.
- **New ✓ branch** when an agent has `model: haiku` with no `effort`: `model=haiku (no effort — correctly omitted)`. Does **not** increment issues. This corrects a v0.6.x false-positive ("missing effort").
- `audit --fix` does **not** auto-strip the stale `effort` from Haiku agents. The invariant "fix skips agents that already have `model:` set — never overwrites user choices" applies here too. Users edit the file manually after seeing the warning.

### Template (`templates/BETTER-MODEL.md`)

- Tier 1 table effort column shows `—` for Haiku entries.
- "Effort Level Reference" `low` row availability: `Sonnet / Opus` only (Haiku removed, with an explicit note that the parameter is not supported on Haiku 4.5).
- "Haiku limitations" footnote replaced with the Anthropic-effort-docs citation.
- Agent Frontmatter Example for Haiku drops the `effort: low` line.
- "Last updated" bumped to 2026-05-12.

### Behavioural change for script consumers

- `npx better-model audit` summary lines changed:
  - Success: `"✓ All agents have model configuration."` → `"✓ All agents have correct model/effort configuration."`
  - Failure: `"⚠ N agent(s) missing model or effort settings."` → `"⚠ N agent(s) with model/effort issues."`
  - Added a third line on failure explaining that stale `effort` on Haiku is not auto-stripped.
- Any CI script that greps for the old strings should update its expected text.

### Migration

- `npx better-model@0.7.0 init` on a v0.6.x project upgrades the routing block automatically. Existing `.claude/agents/haiku-explorer.md` carrying `effort: low` is **not** auto-modified — better-model never overwrites user files. Run `npx better-model audit` to see the warning and edit the file manually if you want a clean audit report.

### Tests

- **119 tests** (was 113; +6 net new). Highlights:
  - Tier 1 assertions in `test/fix.test.js` now expect `effort === undefined` for every Haiku case.
  - Regression guard in `test/fix.test.js` verifies the file content does **not** contain the literal `"effort: undefined"` or `"effort: low"` after `fix()` runs on a Haiku-keyword agent.
  - New `V6_ROUTING_BLOCK` fixture and four new tests in `test/init.test.js` cover the v0.6 → current upgrade path in both installed and fresh-install branches, plus idempotency.
  - Three new audit tests in `test/audit.test.js` use a zero-dep `captureAudit` shim to assert the new ⚠ / ✓ behaviour for Haiku.

### Source

- [Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort) — canonical list of effort-supporting models, fetched 2026-05-12.

## [0.6.2] - 2026-04-24

### Package manager detection

- **New: `detectPackageManager()`** in `src/detect.js` — identifies pnpm, yarn, or bun projects by lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`), with the `packageManager` field in `package.json` as a fallback. Returns `null` for plain npm so the hint stays silent when it can't help. Lockfiles are preferred over the field — a lockfile is stronger evidence of which manager is actually in use.
- **New: package-manager hint in `init`** — when invoked via `npx` inside a pnpm/yarn/bun project, `init` prints a one-line tip suggesting the matching native command (`pnpm dlx`, `yarn dlx`, `bunx`). Printed at most once per invocation in both fresh-install and already-installed paths, after the final success block.

### Why

Many pnpm projects keep pnpm-only keys in `.npmrc` (`node-linker`, `auto-install-peers`, `strict-peer-dependencies`, `enable-pre-post-scripts`). [npm 11 already prints "Unknown project config" warnings](https://github.com/npm/cli/issues/8153) for those, and npm 12 will refuse to start. Running through `pnpm dlx` / `yarn dlx` / `bunx` sidesteps the warnings today; the canonical long-term fix is to [move those keys into `pnpm-workspace.yaml`](https://pnpm.io/settings) in camelCase and keep `.npmrc` for auth/registry only. The hint prevents users from discovering this six months later through a cryptic `npx better-model` failure.

### Tests

- 11 new tests in `test/detect.test.js` covering lockfile detection, `packageManager` field parsing, lockfile-over-field precedence, malformed JSON, and unrecognized prefixes. **113 tests total** (up from 102 in v0.6.0).

### Docs

- New "Using pnpm, yarn, or bun" section in README, framed around fitting the user's existing toolchain rather than working around an npm bug.
- CLAUDE.md invariants updated to document pm-detection precedence and once-per-invocation hint behaviour.
- Zero-dependency constraint preserved — only `node:fs` `existsSync` and `JSON.parse`.

## [0.6.1] - 2026-04-24

### Docs

- **Refreshed "Field data" section** in README with subagent-only aggregate across BM-installed projects (platonmamatov.com, scandal, TA, better-model). Previous v0.5.0 numbers mixed main-session `/model` choices with Agent-tool dispatches — the refined measure isolates what the routing block actually controls.
- Headline: subagent Sonnet share went from 3.8% (pre-install) → 46.2% (v0.5 era) → 45.5% (v0.6 era) — **12× vs baseline**. Opus share moved -6.6 pp (52.7% → 46.1%), confirming the tool doesn't suppress legitimate Opus-tier work. Haiku share dropped from 42.4% (native Explore-agent default) to 4–9%.
- Methodology documented in-line: subagent-only filter via `isSidechain:true` under `subagents/*.jsonl` path; main-session calls excluded; 583 Opus 4.7 subagent calls in v0.6 era are organic frontmatter routing (`db-migrator`, `tg-debugger`), not forced main-session use.
- Code and routing logic unchanged — this is a documentation-only release.

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
