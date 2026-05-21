# Changelog

## [0.10.0] - 2026-05-21

### New: `init --profile blockchain` — opt-in keyword overlay for smart-contract projects

A **profile** in better-model is an opt-in domain-specific keyword overlay applied on top of the base routing rules. It is additive — it catches agents the base keyword set would route to default Sonnet, never demotes an agent's tier. Activation:

```bash
npx better-model init --profile blockchain
```

The blockchain profile covers both major smart-contract ecosystems:

- **EVM family** — Solidity, EVM bytecode, audit tooling (Slither, Mythril)
- **TON family** — FunC, Tact, Fift, TLB schemas, Jetton standard

Keywords added by the profile (all route to Opus xhigh — Anthropic's recommended starting tier for agentic coding):

| Keyword | Match style | Notes |
|---|---|---|
| `solidity`, `evm`, `slither`, `mythril`, `toncoin`, `jetton`, `tlb` | substring | distinctive vocabulary, no general-English collisions |
| `func`, `tact`, `fift`, `contract` | word boundary | short keywords; word-boundary regex avoids matching `function`, `tactic`, `fifth`, `contractual`, etc. |

Field data on Sonnet-vs-Opus performance for Solidity / FunC / Tact specifically is not yet available. The profile is provided as a convenience for users who already know they want Opus on their contract work — when we have measurements from real blockchain projects, we'll update the template at `templates/profiles/blockchain.md` with the actual delta.

### Marker encoding (orthogonal to BLOCK_VERSION_MARKER)

The active profile is encoded inside the routing block in `CLAUDE.md` as a separate metadata comment:

```html
<!-- better-model:start -->
<!-- better-model block version: 0.10 -->
<!-- better-model profile: blockchain -->
## Model Routing (better-model)
...
<!-- better-model:end -->
```

Encoding the profile orthogonally to `BLOCK_VERSION_MARKER` means future block-version upgrades can preserve the user's profile choice automatically. Re-running `npx better-model init` without `--profile` preserves the existing marker; passing `--profile <other>` updates it; manually deleting the marker reverts to no profile on next init.

### BLOCK_VERSION_MARKER bump: 0.7 → 0.10

The routing block version marker is incremented to `0.10` (aligned with the npm version — we skip 0.8 and 0.9 in the block marker because the routing block itself did not change in v0.8 / v0.9, only observability around it did). On next `init`, every v0.7-installed project silently upgrades to v0.10. **This is invisible to users**: no manual action required, no behavior change without `--profile <name>`. Anything you wrote OUTSIDE the `<!-- better-model:start -->` / `<!-- better-model:end -->` markers is preserved verbatim. Content INSIDE those markers is owned by better-model and will be regenerated on each upgrade — if you want a custom routing rule, place it elsewhere in your CLAUDE.md.

### Threading through the toolchain

The active profile is threaded through every code path that calls `inferModel`:

- `npx better-model audit --fix` reads the project profile and applies overlay keywords during frontmatter injection.
- `npx better-model stats` reads the profile and uses it when computing the expected-model side of deviation detection. Profile-overlay agents that match (e.g. `solidity-coder → opus/xhigh`) no longer register as deviations against base inference.
- `--all-projects` mode in stats does NOT read profile (it cannot resolve other projects' CLAUDE.md from the projects-hash directory); falls back to inference-only — same as the frontmatter-aware expectation in v0.9.0.

### Tests

39 new (198 → 237). Coverage:

- 13 `inferModel` profile tests (Solidity vocabulary, TON vocabulary, priority ordering, word-boundary FP guards for `func`/`tact`/`fift`/`contract`, additive invariant, unknown profile, null/undefined profile).
- 26 `init` profile tests (`buildRoutingBlock`, `readProfileFromBlock`, `readProjectProfile`, `parseInitArgs` parsing + error paths, `init()` fresh install with profile, re-init preserves existing profile, re-init with different `--profile` updates marker, v0.7 → v0.10 upgrade with and without profile, invalid-profile rejection without file modification).

### What's not in v0.10.0

- **Haiku keyword expansion** — Phase 3 observation window deferred (user manages own cadence). Will ship as v0.11 or v0.10.1 if field data shows under-routing.
- **`code-reviewer` keyword split** — community feedback still gated.
- **Additional profiles** — `wordpress`, `analytics`, `content` not justified by evidence (per Phase 4 scope memo). `blockchain` is the only domain with dedicated benchmarks (SolidityBench, CryptoBench).
- **Skill template with `${CLAUDE_EFFORT}`** — Anthropic syntax stabilization still pending (~August 2026).
- **Hook-based defense against `claude agents --model`** — engineering-feasible but its own scope.

## [0.9.0] - 2026-05-21

### New: per-subagent_type breakdown + deviation reporting in `stats`

`npx better-model stats` now shows what each subagent_type was dispatched on, plus a **deviation** count: how many dispatches did *not* match the model better-model would have inferred. When the current project's `.claude/agents/*.md` includes a `model:` frontmatter for that subagent, that value becomes the expectation (frontmatter wins over keyword inference); otherwise the keyword-based `inferModel()` is the expectation. This makes routing block discipline visible without changing what the routing block actually does.

```
Subagent dispatch by type (deviations vs frontmatter or inference):
  type             total  dev   Sonnet%   Opus%  Haiku%
  general-purpose      6    1       17      83       0
  Explore              5    5      100       0       0
  code-reviewer        4    0        0     100       0
```

**Two important reads of the `dev` column**:
1. If `dev == total` (like `Explore` above with 5/5), that's almost always an intentional caller-side preference — e.g., your global CLAUDE.md tells the main agent "use Sonnet for Explore" and better-model's keyword inference says Haiku. Both are correct; the column just makes the divergence visible.
2. If `dev` is non-zero but well below `total`, that's the main agent making per-task judgement calls. Often fine, occasionally worth a look.

`--json` schema extension (additions-only, no breaking changes): `subagent_dispatch.by_type` is a new field. Each entry has `total`, `deviations`, `deviation_rate`, `models` (raw counts per bucket), and `expectation_source` (`"frontmatter"` / `"inference"` / `"mixed"` / `"none"`). Keys are sorted alphabetically for deterministic diffs.

### Why deviation detection (not override detection)

A short internal spike discovered that the JSONL schema cannot tell a routing-block default apart from a caller-side override at the field level — the main agent writes `input.model` in both cases. We pivoted to **deviation detection**: instead of asking "was this an override?", ask "did this actual model match what we'd have expected?". The answer is computable without schema discriminators and surfaces the same information.

### New section in README: bypass surfaces

`README.md` "What better-model controls (and what it doesn't)" now explicitly names three bypass surfaces:
1. Caller-side `input.model` written by the main agent at runtime (often intentional, matching CLAUDE.md preferences).
2. `claude agents --model <id> --effort <lvl>` CLI flags (Claude Code v2.1.142, 2026-05-14).
3. `/model` keystroke mid-session (Claude Code reserves this for the user).

Plus a one-liner showing how to opt out of the `review` → Opus default if your code-review tasks are typically single-file and Sonnet suffices.

### Tests

20 new (178 → 198). Coverage matrix:
- 3 `extractSubagentDispatches` tests (full info, defaults for missing fields, backward-compat of `extractSubagentModels`)
- 7 `loadProjectAgents` + `computeExpectedModel` tests (frontmatter parse, missing model, missing dir, full ID normalization, frontmatter precedence, inference fallback, null projectAgents)
- 6 by-type aggregation tests (model distribution, deviation against inference, deviation against frontmatter, `(empty)` bucket, `none` expectation source, unknown model excluded from deviations)
- 4 formatter tests (text rendering sorted by total, omits when empty, JSON schema with `deviation_rate` and `expectation_source`, JSON emits empty object when byType empty)

### What's not in v0.9.0

- **Haiku keyword expansion** (`enumerate`/`survey`/`inventory`/...) — gated on Phase 3 field data after 14 days of clean v0.9.0 observability. Will ship as v0.9.1 if Phase 3 finds genuine under-routing.
- **`code-reviewer` keyword split** — gated on Phase 3 evidence; user feedback says keep Opus default and document the opt-out (which v0.9.0 does).
- **`--profile blockchain`** — Phase 4 work, opt-in preset for Solidity-heavy projects. Ships separately as v0.10.0 with "convenience preset, awaiting field data" framing.
- **Hook-based defense against `claude agents --model`** — engineering-feasible (PreToolUse on Agent calls), but its own scope; defer to v0.10+ if demand emerges.

## [0.8.1] - 2026-05-12

### Docs

- **Define "Vanilla Claude Code" before the economics table.** Reader feedback: the term was load-bearing in the savings claim but never defined. One-sentence callout now sits just above the table: stock Claude Code without better-model on a Pro/Max subscription, Opus 4.7 + `high` effort everywhere (the default since v2.1.118, Apr 23, 2026). That's the baseline `−18%` compares against.

No code changes. 178 / 178 tests pass.

## [0.8.0] - 2026-05-12

### New: `stats` command — read-only observability

`npx better-model stats` aggregates Agent tool_use dispatches from `~/.claude/projects/<hash>/*.jsonl` (root-level files only, non-recursive — subagent inner sessions in `subagents/` subdirs are explicitly ignored) and shows the empirical routing distribution alongside the README target.

**Two metrics, surfaced separately:**
- **Main agent model distribution** (per `record.message.model`) — your Claude Code setting; better-model does not control this.
- **Subagent dispatch distribution** (per `tool_use.input.model`) — what the routing block in `CLAUDE.md` actually influences.

The split is deliberate: without it, a user who keeps the main agent on Opus would see "100% Opus" and mistake it for a better-model failure.

**Flags:**
- `stats` — current project, 7-day rolling window, text output
- `stats --days N` and `stats --days=N` — custom window (positive integer; rejects `--days abc`, `--days 0`, `--days=1.5` with exit 1 + usage hint)
- `stats --all-projects` — aggregate across every project under `~/.claude/projects/`
- `stats --json` — machine-readable output with stable schema (additions only across releases): `project`, `window_days`, `from`, `to`, `sessions`, `main_agent.{total,counts}`, `subagent_dispatch.{total,counts,percentages}`, `readme_target`.

**Universal-robustness pass.** Every common failure mode produces a friendly message rather than a stack trace:
- `~/.claude/projects/` missing → "Claude Code logs not found. Run a session first."
- Project hash dir missing → "No data for this project yet. Try `--all-projects` for an aggregate view."
- Empty dir → "No session data."
- Empty window → "0 Agent calls in last N days. Try `--days 30`."
- All session files unreadable → exit 1 with "Schema may have changed — please file an issue."
- Invalid `--days` (non-positive-integer) → exit 1 with usage hint.
- Unknown flag → exit 1 with usage hint.

**Privacy invariant.** Output never emits prompt content, UUIDs, tool-call IDs, or session IDs. A regex-pinned test asserts this over both text and JSON outputs.

**Schema resilience.** Defensive parsing throughout: malformed JSON lines silently skipped (counted as `linesFailed` but never crash the aggregation); missing fields (e.g. `record.cwd` is absent on ~23% of records in real data) handled gracefully; `isSidechain: true` records skipped to avoid double-counting nested Agent calls. A 20-line fixture at `test/fixtures/sample-session.jsonl` anchors the current schema; if Claude Code ships a breaking change, the fixture-roundtrip test will fail and tell us to update.

**Hash-collision fallback.** When the deterministic project-hash directory is missing (cwd has spaces, dots, non-ASCII characters, or differs from how Claude Code hashed it), `stats` falls back to scanning all project dirs, peeking the first 10 records of each session file (8 KB cap per file), and matching the `cwd` field against `process.cwd()`. On multi-match, picks the most-recently-modified dir and prints a friendly note suggesting `--all-projects` for the aggregate view.

**Performance.** All file reads stream via `node:readline` — no full-file loads. Tested on the author's setup: aggregates 47 session files across 53 project dirs in under one second.

### Tests

54 new (124 → 178). Coverage matrix:
- 7 normalization / pure-function tests (`projectHash`, `normalizeMainModel`, etc.)
- 9 record-extraction tests (Agent vs non-Agent tool_use, sidechain, multi-block, missing input.model)
- 6 aggregator tests (window edges, malformed lines, multi-file, percentages denominator)
- 13 runStats integration tests (each failure mode, --json schema, privacy regex, --days validation, multi-match fallback warning)
- 14 parseStatsArgs CLI parser tests (boolean flags, space/equals value forms, missing/invalid/empty/fractional/negative inputs, unknown flag)
- 5 fixture / layout tests (T29 anchor with exact expected counts, T30 non-recursive listSessionFiles)

### What's not in v0.8.0

- **Skill template with `${CLAUDE_EFFORT}`** — deferred until Anthropic's substitution syntax stabilizes.
- **`audit --strip-haiku-effort`** — destructive flag, no user requests, would violate the "never overwrite user model choices" invariant.
- **Mythos Preview integration** — invite-only, not actionable.
- **`--from` / `--to` ISO date flags** — defer to v0.8.1 if requested.
- **`stats --diagnose`** — analytics for routing-block discipline (was the Explore subagent dispatched on Haiku as the routing block recommended? or on Sonnet?) — defer to v0.8.1.
- **Subagent effort breakdown** (Opus xhigh vs Opus max) — `effort` is not present in `tool_use.input` for many real records; defer until that field stabilizes.
- **Color output** — zero-dep constraint.
- **Telemetry beacon** — never (invariant).

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
