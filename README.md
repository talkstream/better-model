# better-model

**Stop waiting for Opus on every grep.**

93.8% of Claude Code tokens go to Opus unnecessarily. better-model routes tasks to the right model — shifts ~60% of subagent work to Sonnet 4.6 (~1.4× faster, ~5× cheaper, ~91% of Opus quality on routine coding) and reserves Opus 4.7 for multi-file refactoring, architecture, and security.

[![npm version](https://img.shields.io/npm/v/better-model)](https://www.npmjs.com/package/better-model)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/better-model)
[![install size](https://packagephobia.com/badge?p=better-model)](https://packagephobia.com/result?p=better-model)
[![license](https://img.shields.io/npm/l/better-model)](https://github.com/talkstream/better-model/blob/main/LICENSE)

```bash
npx better-model init
```

## The problem

You pay for Max or Team Premium. You get Opus on every task. Sounds great — until you notice:

- **File search?** Opus. 3–5 seconds wait.
- **Grep for a function name?** Opus. 3–5 seconds wait.
- **Write a single test?** Opus. 10+ seconds wait.
- **Rename a variable?** Opus. 10+ seconds wait.

Sonnet 4.6 handles all of these at ~91% of Opus quality, ~1.4× faster, and 5× cheaper.

| Metric | Opus 4.7 | Sonnet 4.6 | Haiku 4.5 | Notes |
|---|---|---|---|---|
| [SWE-bench Verified](https://www.swebench.com) | 87.6% | 79.6% | — | Gap 8.0 pts |
| [SWE-bench Pro](https://www.swebench.com) | 64.3% | n/a | — | Agentic coding; Opus 4.7 +10.9 pts gen-on-gen |
| [GPQA Diamond](https://arxiv.org/abs/2311.12022) | 94.2% | 74.1% | — | Gap 20.1 pts (reasoning, where Opus earns it) |
| Terminal-Bench 2.0 | 69.4% | n/a | — | Tool-use / agentic |
| Context window | 1M | 1M | 200K | Opus regression >500K |
| Price (input / output) | $5 / $25 | $3 / $15 | $1 / $5 | per MTok |
| Relative speed | baseline | ~1.4× faster | ~2× faster | subjective |

**Opus 4.7 caveats**: new tokenizer produces 1.0–1.35× tokens vs 4.6 on identical text (effective cost on long prompts may rise up to ~35%; prompt caching is more valuable than before). Documented "lost in the middle" regression past ~500K tokens — for large-context tasks, prefer Sonnet 4.6 or chunk.

The gap only matters for architecture, security audits, multi-file refactoring, and novel problem-solving. That's ~20% of tasks. better-model routes the other 80% to where they belong.

## How it works

**Step 1.** Run `npx better-model init` in your project.

**Step 2.** It creates two optimized agents (`sonnet-coder` and `haiku-explorer`), drops a decision matrix into `docs/BETTER-MODEL.md`, adds a `CRITICAL` routing block to `CLAUDE.md` with `xhigh`/`max` effort mapping for Opus 4.7 tasks, and injects `model:`/`effort:` frontmatter into any existing `.claude/agents/` and `.claude/skills/`.

**Step 3.** Claude Code reads the routing block at session start and dispatches subagent tasks to the right model — Sonnet for coding, Haiku for search, Opus 4.7 + xhigh for multi-file work and code review, Opus 4.7 + max for architecture/security/novel algorithms.

That's it. No dependencies, no proxies, no hooks. Two agents, one decision matrix, correct frontmatter.

## How better-model decides — the algorithm, transparently

No black box. The routing logic is a single function at [`src/fix.js:10-57`](src/fix.js), applied to `<agent-name> <agent-description>` lowercased. First-match-wins:

```text
1. Haiku tier  →  model: haiku  (no effort field — Haiku 4.5 does not support it)
   keywords:    explore, search, scan, grep, find, discover,
                verify, health, check, status, monitor

2. Opus + max  →  model: opus, effort: max
   keywords:    architect, security, novel, algorithm, ultraplan
   rationale:   frontier reasoning — GPQA Diamond 94.2% vs 74.1%

3. Opus + xhigh  →  model: opus, effort: xhigh
   keywords:    audit, migrate, migration, migrator, review,
                orchestrate, orchestrator, advisor
   rationale:   Anthropic-recommended starting point for Opus 4.7 coding/agentic;
                covers multi-agent orchestration and the "Advisor strategy"
                pattern from Code with Claude 2026; "review" subsumes
                "ultrareview" by substring

4. Sonnet + high  →  model: sonnet, effort: high
   keywords:    lint, debug, investigate, diagnose
   rationale:   needs rigor on isolated bugs

5. Sonnet + medium  →  model: sonnet, effort: medium
   keywords:    test, format, deploy, build, generate, refactor, pipeline
   rationale:   standard coding work

6. Default fallback  →  model: sonnet, effort: medium
```

Read the source, fork it, tweak it. Adding a keyword to a tier is a one-line change. The full evidence-based mapping with benchmark citations lives in [`templates/BETTER-MODEL.md`](templates/BETTER-MODEL.md).

## What you gain — measured economics

Normalized "task unit" = 300K input tokens + 1M output tokens at medium-effort baseline. Same task across three routing strategies:

> **"Vanilla Claude Code"** = stock Claude Code without better-model installed, on a Pro/Max subscription. Since Claude Code v2.1.118 (Apr 23, 2026) the default model is Opus 4.7 and the default effort is `high` — applied to every task: main agent turns, every subagent dispatch, every grep, every test write. That's the baseline we compare against.

| Scenario | Cost / task | Quality (SWE-bench Verified blend) | Speed (relative) |
|---|---:|---:|---:|
| Vanilla Claude Code (Max default: Opus 4.7 + `high` everywhere) | ~$47 | 87.6% | 1.0× baseline |
| Always Opus 4.7 + `max` effort | ~$122 | ~87.6%¹ | ~0.5× (much slower) |
| **better-model routing** (Sonnet 55.6% / Opus 32.8% / Haiku 11.7%) | **~$38** | **~82.6%** | **~1.4× faster avg** |
| → savings vs Vanilla | **−18%** | −5.0 pts | +40% faster |
| → savings vs Always-max | **−68%** | similar quality | ~2.8× faster |

¹ `max` effort doesn't improve quality on most coding work — Anthropic explicitly warns it overthinks on structured-output tasks like code review.

<details>
<summary><strong>Methodology — every assumption, openly</strong></summary>

- **Task unit**: 300K input tokens + 1M output tokens at "medium" effort baseline. Effort multipliers scale only the output side.
- **Opus 4.7 tokenizer**: 1.20× multiplier on both sides (per [Anthropic pricing docs](https://platform.claude.com/docs/en/about-claude/pricing), "up to 1.35× more tokens for the same fixed text" — 1.20× is the mid-range; code-heavy prompts trend toward 1.35×).
- **Effort multipliers** (output side, approximating Anthropic guidance — actual variance depends on workload): `low` 0.6×, `medium` 1.0×, `high` 1.5×, `xhigh` 2.5×, `max` 4.0×.
- **Within-tier mix**: Sonnet 80% medium / 20% high (debug-heavy work); Opus 80% xhigh / 20% max (most coding stays at `xhigh` per Anthropic).
- **Routing distribution**: empirical May 2026 (n=961 subagent calls across four better-model-installed projects). See "Field data" below.
- **Quality blend**: SWE-bench Verified weighted by routing share, coding-only tasks (88.3% of routed work). Haiku-tier search tasks excluded — not benchmarked.
- **Prompt cache**: NOT included. Claude Code v2.1.133 gives a 3× reduction on subagent caches, but it applies equally across all three scenarios, so it cancels out of the comparison.
- **Per-project variance**: a Telegram-automation project routes ~73% to Haiku; a content-app project routes ~62% to Sonnet. Your savings depend on your task mix.

Reproduce on your own numbers:

```python
SONNET_SHARE, OPUS_SHARE, HAIKU_SHARE = 0.556, 0.328, 0.117  # your distribution
SONNET_HIGH_RATIO, OPUS_MAX_RATIO = 0.20, 0.20               # within-tier mix

MULT = {"low": 0.6, "medium": 1.0, "high": 1.5, "xhigh": 2.5, "max": 4.0}
IN_PRICE  = {"haiku": 1, "sonnet": 3, "opus": 5}    # $/MTok input
OUT_PRICE = {"haiku": 5, "sonnet": 15, "opus": 25}  # $/MTok output
TOKENIZER = {"opus": 1.20, "sonnet": 1.0, "haiku": 1.0}

def cost(model, effort):
    inp = 0.3 * TOKENIZER[model] * IN_PRICE[model]
    out = 1.0 * MULT[effort] * TOKENIZER[model] * OUT_PRICE[model]
    return inp + out

sonnet = 0.80 * cost("sonnet", "medium") + 0.20 * cost("sonnet", "high")
opus   = 0.80 * cost("opus",   "xhigh")  + 0.20 * cost("opus",   "max")
haiku  = cost("haiku", "medium")  # no effort

better      = SONNET_SHARE*sonnet + OPUS_SHARE*opus + HAIKU_SHARE*haiku
vanilla     = cost("opus", "high")  # Max-subscriber default
always_max  = cost("opus", "max")

print(f"Vanilla:      ${vanilla:6.2f}")     # ~$46.80
print(f"Always-max:   ${always_max:6.2f}")  # ~$121.80
print(f"better-model: ${better:6.2f}")      # ~$38.44
```

</details>

## Field data

Refined methodology — **subagent-only** calls (Agent tool invocations, controlled by the routing block) in projects where better-model is installed. Excludes main-session `/model` choices, which depend on the user's manual selection and don't reflect routing behaviour.

Measured on a single Max subscriber across the projects where better-model was installed (`platonmamatov.com`, `scandal`, `TA`, `better-model`):

```
                      Pre-install           v0.5.x era            v0.6.x era
                      Mar 1 – Apr 4         Apr 12 – Apr 15       Apr 16 – Apr 24

  Subagent calls      44,319                1,704                 1,266

  Opus                52.7%                 49.2%                 46.1%    -6.6pp
  Sonnet               3.8%                 46.2%                 45.5%    +41.7pp  ← 12×
  Haiku               42.4%                  4.6%                  8.5%    -33.9pp
```

**The headline: Sonnet share in subagent dispatch went from 3.8% to ~46%** — a 12× increase. Most of that shift came out of Haiku (42.4% → ~9%) — routine coding tasks that were previously handled by the native Explore-agent Haiku are now routed to `sonnet-coder` where code quality matters. Opus share moved only -6.6 pp, confirming the tool doesn't suppress legitimate Opus-tier work.

> **Caveats:** Numbers are from one user across 4 projects. Pre-install Haiku share (42.4%) reflects the native Claude Code Explore agent, not a missing baseline. v0.6 era sample is smaller (1,266 calls over 9 days) than pre-install (44,319 calls over ~5 weeks). Main-session `/model` choices and projects without better-model installed are excluded. The previous v0.5.0 field test numbers (published in v0.5.0 README) mixed main-session and subagent calls — the refined subagent-only aggregate above is a cleaner measure of what the routing block actually controls.

## Observability

You don't have to take the published field data on faith. Run `npx better-model stats` in any project where better-model is installed and you get the same measurement, computed locally and read-only, against your own session history.

```bash
$ npx better-model stats
better-model stats — /Users/alice/Projects/payment-service
Window: last 7 days (2026-05-05T19:00:00.000Z → 2026-05-12T19:00:00.000Z)
Source: 3 session files, 47 Agent calls

Main agent (your Claude Code setting — better-model does NOT control):
  Opus     100.0%  (412 turns)

Subagent dispatch (controlled by better-model routing):
  Sonnet    55.3%  (26 calls)
  Opus      31.9%  (15 calls)
  Haiku     12.8%  (6 calls)

Compared to README target (Sonnet 55.6% / Opus 32.8% / Haiku 11.7%):
  ✓ Sonnet     -0.3 pp
  ✓ Opus       -0.9 pp
  ✓ Haiku      +1.1 pp
```

The ✓/⚠/✗ markers reflect distance from the README target: within ±5 pp gets a ✓, 5–15 pp gets ⚠, beyond 15 pp gets ✗.

The two blocks are separate on purpose. **Main agent** is whichever model you pick in Claude Code's settings — better-model has no way to swap it mid-session (Claude Code's harness reserves that for explicit user `/model` keystrokes). **Subagent dispatch** is what the routing block in `CLAUDE.md` actually controls — the model chosen for each `Agent()` tool call your main agent makes. Keeping them visually separate prevents the "100% Opus → better-model is broken" misread.

```bash
$ npx better-model stats --days 30      # 30-day rolling window
$ npx better-model stats --all-projects # aggregate across every CC project
$ npx better-model stats --json         # stable schema for scripts / CI
```

The `--json` schema is stable across releases (additions only): top-level `project`, `window_days`, `from`, `to`, `sessions`, `main_agent.{total,counts}`, `subagent_dispatch.{total,counts,percentages,by_type}`, `readme_target`.

### Per-subagent_type breakdown

> **Deviation** = a dispatch where the actual `model` differs from what better-model would have expected. The expectation comes from the agent's `model:` frontmatter when present; otherwise it falls back to keyword inference from the agent's name + description.

Since v0.9.0, the default `stats` output also shows what each `subagent_type` was dispatched on, alongside a `dev` count column:

```
Subagent dispatch by type (deviations vs frontmatter or inference):
  type             total  dev   Sonnet%   Opus%  Haiku%
  general-purpose      6    1       17      83       0
  Explore              5    5      100       0       0
  code-reviewer        4    0        0     100       0
```

*(Illustrative output — the rows you see depend on which subagent types your project actually dispatched in the window.)*

Most deviations are **intentional caller-side overrides** matching your personal preference (e.g., your CLAUDE.md may say "Explore subagents should run on Sonnet, not Haiku" — that's a deviation against inference, but it's your call). The column is there so you can spot patterns, not so you panic. If a row is 100% deviation across many calls, that's a signal worth investigating; one-off deviations are usually fine.

In `--json`, each type appears under `subagent_dispatch.by_type` with `total`, `deviations`, `deviation_rate`, `models` (object with raw counts under keys `opus` / `sonnet` / `haiku` / `unknown`), and `expectation_source` (`"frontmatter"`, `"inference"`, `"mixed"`, or `"none"` — the last for rows that contained only `unknown` models).

### What better-model controls (and what it doesn't)

| ✓ better-model controls | ✗ better-model does not control |
|---|---|
| `model` (and `effort` for Opus/Sonnet) in every `Agent()` subagent dispatch — via the routing block hint in `CLAUDE.md` | Your **main agent** model — that's your Claude Code setting |
| Two ready-to-use subagent agents: `sonnet-coder`, `haiku-explorer` | Your **main agent** effort — same |
| `model:` frontmatter injection in `.claude/agents/` and `.claude/skills/` (via `audit --fix`) | When the main agent decides to spawn a subagent (the main agent's call) |
| Per-subagent_type deviation reporting in `stats` so you can see when the main agent overrides the routing hint | Mid-session model switching — Claude Code's harness reserves `/model` for the user |
| | Whether the main agent respects the routing block hint (it's a hint — sample data shows Explore subagents occasionally dispatched on Sonnet when the agent judged the task needed more rigor) |
| | Caller-side `model: ...` written directly into an `Agent()` call by the main agent (often intentional, matching your CLAUDE.md preferences) |
| | The `claude agents --model <id> --effort <lvl>` CLI flags (added in Claude Code v2.1.142, 2026-05-14) — these override the routing block at invocation time |

**Where savings actually come from.** In Plan Mode on a typical task, the main agent runs on Opus + xhigh end-to-end and spawns 1–3 Explore subagents — better-model can route those to Haiku, saving ~5–10% of the session cost. In `/loop` autonomous mode the main agent spawns more variety (`haiku-explorer`, `sonnet-coder`, `code-reviewer`, `architect`), and savings rise to the ~15–30% range consistent with the field data above. better-model shines when your workflow is subagent-heavy; if you spend all session in main-agent direct edits, the savings are necessarily smaller.

**A note on code review tier.** The inference engine routes any agent whose name or description contains `review` to Opus + xhigh — that's our default because most reviews involve cross-file context and the gap from Sonnet matters. If your reviews are typically single-file and you prefer Sonnet, add one line to your global `~/.claude/CLAUDE.md` (the file Claude Code reads on every session) to opt out:

```
Agent() calls with subagent_type=code-reviewer — model: "sonnet", effort: "high"
```

`stats` will show this as a deviation row (e.g. `code-reviewer 38 38 100% Sonnet`) — that's expected, and it confirms your preference is being honored.

## Two modes

| Mode | Command | What it does |
|---|---|---|
| **Enforcement** (default) | `npx better-model init` | Agents + routing block + inject `model:`/`effort:` into agents/skills (opus-tier → `xhigh`/`max`) |
| **Soft** | `npx better-model init --soft` | Matrix as reference only — no agents, no frontmatter changes |

> [!TIP]
> In a [field test](https://github.com/talkstream/better-model), a Claude Code session read the decision matrix in soft mode and **proactively updated agent configs on its own** — applying the correct model to all 8 agents and skills without `audit --fix` being run.

## Profiles

A **profile** in better-model is an opt-in keyword overlay that adds domain-specific vocabulary on top of the base routing rules. It is *additive only*: it never demotes an agent's tier, only catches agents the base keyword set would route to default Sonnet. Currently one profile ships.

| Profile | Activate | Covers | Adds keywords (Tier 3 xhigh) |
|---|---|---|---|
| `blockchain` | `npx better-model init --profile blockchain` | EVM family (Solidity) and TON family (FunC, Tact, Fift) | `solidity`, `evm`, `slither`, `mythril`, `toncoin`, `jetton`, `tlb`, plus word-boundary matches for `func`, `tact`, `fift`, `contract` |

Profile choice is encoded inside the routing block in `CLAUDE.md` as a metadata comment (`<!-- better-model profile: blockchain -->`), orthogonal to the block-version marker. Re-running `init` without `--profile` preserves your existing choice; passing `--profile <other>` updates it.

**On efficacy claims.** We don't yet have field measurements comparing Sonnet vs Opus on Solidity / FunC / Tact specifically. The blockchain profile is a convenience for users who already know they want Opus on their contract work — when field data exists, we'll update the profile template at [`templates/profiles/blockchain.md`](templates/profiles/blockchain.md) with the actual delta.

**Why blockchain is the only profile (for now).** `templates/BETTER-MODEL.md` and our field-data analysis both point to **task complexity** as the dominant routing axis, with domain as a marginal secondary signal. Most domain presets (`wordpress`, `analytics`, `content`) risk suppressing Opus on genuinely complex work without a corresponding quality measurement. Blockchain is the one domain with dedicated benchmarks ([SolidityBench](https://blog.iqai.com/soliditybench-by-iq-the-first-leaderboard-for-evaluating-llm-solidity-code-generation/), [CryptoBench](https://arxiv.org/pdf/2512.00417)) suggesting a genuinely distinct capability footprint — different enough from general coding to warrant separate routing treatment.

## Commands

| Command | Description |
|---|---|
| `npx better-model init` | Install with enforcement (default) |
| `npx better-model init --soft` | Install soft mode — reference only |
| `npx better-model init --profile <name>` | Activate a domain-specific keyword overlay (`blockchain` currently supported) |
| `npx better-model audit` | Report agents/skills missing model settings |
| `npx better-model audit --fix` | Auto-inject model/effort frontmatter |
| `npx better-model stats` | Show recent Agent-call model distribution (last 7 days) |
| `npx better-model stats --days N` | Same, with a custom window |
| `npx better-model stats --all-projects` | Aggregate across every project under `~/.claude/projects/` |
| `npx better-model stats --json` | Machine-readable output for scripts and CI |
| `npx better-model reset` | Remove better-model and restore defaults |
| `npx better-model status` | Check installation status |

## The algorithm

The decision matrix organizes tasks into three tiers based on published benchmarks:

<details>
<summary><strong>Tier 1 — Haiku 4.5 (~20% of tasks)</strong></summary>

Codebase exploration, file search, pattern matching. Short, focused subagent tasks that require no reasoning.

**Limitation**: unreliable beyond ~15 turns. Use only for quick subagent bursts. **Note**: Haiku 4.5 does **not** support the `effort` parameter — set `model: haiku` without any `effort` field.
</details>

<details>
<summary><strong>Tier 2 — Sonnet 4.6 (~60% of tasks)</strong></summary>

The default for most coding: code generation, feature implementation, test writing, simple refactoring (1–2 files), single-file debugging.

Sonnet 4.6 delivers ~91% of Opus 4.7 coding quality (SWE-bench Verified 79.6% vs 87.6%) at ~20% of the cost ($3/$15 vs $5/$25). Default effort: `medium` — Anthropic's recommended balance of speed, cost, and performance for agentic coding.
</details>

<details>
<summary><strong>Tier 3 — Opus 4.7 (~20% of tasks)</strong></summary>

Reserved for tasks where Sonnet has documented failure modes: multi-file refactoring (3+ files), cross-file debugging, architecture design, security audits, code review, novel algorithm design, migrations.

Default effort: **`xhigh`** (Anthropic-recommended starting point for coding and agentic work on Opus 4.7). Reserve `max` for architecture, security audits, and novel algorithms only — on structured-output tasks like code review, `max` can overthink.

The GPQA gap (20.1 points) and the SWE-bench Pro lead (64.3% vs 53.4% on Opus 4.6 generation) are real — Opus 4.7 earns its place here.
</details>

### Key rules

1. **Default to Sonnet + medium effort** — covers ~60% of tasks.
2. **Escalate to Opus 4.7 + `xhigh`** when the task spans 3+ files, is multi-step agentic, or needs multi-file coherence.
3. **Escalate to Opus 4.7 + `max`** only for architecture design, security audits, and novel algorithm design.
4. **Downgrade to Haiku** for search and pattern-matching subagents (no `effort` field — Haiku 4.5 does not support it).
5. **On Sonnet failure**, escalate to Opus 4.7 — don't retry Sonnet at higher effort. A stronger model at lower effort outperforms a weaker model at higher effort.
6. **Avoid Opus 4.7 on >500K tokens** of live context — documented lost-in-the-middle regression; chunk the task or use Sonnet 4.6.

See the [full decision matrix](templates/BETTER-MODEL.md) for complete details and evidence.

## Why not just write CLAUDE.md rules yourself?

You can! better-model is just a well-researched starting point:

- **Evidence-based**: every routing rule cites published benchmarks (Anthropic, LLM-Stats, CodeRabbit), not vibes
- **Ships ready-to-use agents**: `sonnet-coder` (model: sonnet, effort: medium) and `haiku-explorer` (model: haiku, no effort field) — 100% compliance vs ~70% from CLAUDE.md alone
- **Inference engine**: maps agent names to the right tier automatically (review → Opus + xhigh, architect → Opus + max, scan → Haiku without effort)
- **Maintained**: as models and benchmarks evolve, `npx better-model@latest init` gets you the updated matrix — v0.5 → v0.6 auto-upgrades in place
- **Reversible**: `npx better-model reset` removes everything cleanly

## Evidence base

- [SWE-bench Verified](https://www.swebench.com) — Opus 4.7 87.6% vs Sonnet 4.6 79.6% (Opus 4.7 release April 16, 2026)
- [SWE-bench Pro](https://www.swebench.com) — Opus 4.7 64.3% (+10.9 pts vs Opus 4.6)
- [GPQA Diamond](https://arxiv.org/abs/2311.12022) — Opus 4.7 94.2% vs Sonnet 4.6 74.1%
- [Terminal-Bench 2.0](https://www.anthropic.com/news/claude-opus-4-7) — Opus 4.7 69.4%
- [MCP-Atlas](https://www.anthropic.com/news/claude-opus-4-7) — Opus 4.7 77.3% (agentic tool use)
- [CodeRabbit](https://www.coderabbit.ai/blog/claude-opus-4-7-for-ai-code-review) — Opus 4.7 code review study, 68/100 pass rate (+24% vs baseline)
- [Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort) — `xhigh` recommended for Opus 4.7 coding/agentic
- [Claude Code changelog](https://code.claude.com/docs/en/changelog) — `xhigh` + `/effort` slider shipped in v2.1.111 (April 16, 2026)
- [Anthropic Models overview](https://docs.anthropic.com/en/docs/about-claude/models) — official specs
- [RouteLLM](https://github.com/lm-sys/RouteLLM) — model routing research (ICLR)
- [Claude Code Issue #27665](https://github.com/anthropics/claude-code/issues/27665) — real token usage data from Max subscribers

## Get started

```bash
npx better-model init
```

Then start a Claude Code session. Watch it pick Sonnet for your next grep — and Opus 4.7 + `xhigh` for your next multi-file refactor.

### Using pnpm, yarn, or bun

better-model fits whichever package manager your project already uses:

```bash
pnpm dlx better-model@latest init    # pnpm
yarn dlx better-model@latest init    # yarn berry
bunx better-model@latest init        # bun
```

If you run `npx better-model init` inside a pnpm, yarn, or bun project, better-model notices your lockfile or `packageManager` field and prints a one-line tip with the native command — so your next run stays quiet and fits into your existing toolchain. No hint appears in plain npm projects; you only see it when it's actually useful.

**Why we went out of our way for this.** Many pnpm projects keep pnpm-only keys in `.npmrc` — `node-linker`, `auto-install-peers`, `strict-peer-dependencies`, `enable-pre-post-scripts`. npm 11 already prints "Unknown project config" warnings for those, and [npm 12 will refuse to start](https://github.com/npm/cli/issues/8153). We didn't want you to discover that the hard way through a cryptic `npx better-model` failure six months from now. Running through `pnpm dlx` / `yarn dlx` / `bunx` sidesteps the warnings today; the canonical long-term fix is to [move those keys into `pnpm-workspace.yaml`](https://pnpm.io/settings) in camelCase (`nodeLinker: isolated`, `autoInstallPeers: true`, …) and keep `.npmrc` for auth and registry only.

### Upgrading from v0.6.x

```bash
npx better-model@latest init
```

The v0.7.0 `init` recognises your v0.6.x routing block (which carried `effort: "low"` for Haiku — now known to be unsupported by Haiku 4.5 per [Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)) and upgrades it in place. Your existing `haiku-explorer.md` is left untouched — better-model never overwrites user files. Run `npx better-model audit` to see flagged stale `effort` on Haiku agents (⚠) and edit manually if you want a clean report.

### Upgrading from v0.5.x

```bash
npx better-model@latest init
```

The v0.7.0 `init` recognises your v0.5.x routing block and upgrades it in place — no `reset` needed. Agents (`sonnet-coder`, `haiku-explorer`) remain unchanged; only the CLAUDE.md routing block is updated to the Opus 4.7 + `xhigh`/`max` mapping (with Haiku correctly omitting effort).

### Upgrading from v0.4.x

```bash
npx better-model@latest init
```

The single-line reference from v0.4.x is automatically replaced with the full v0.7.0 routing block in a single step — no data loss, no manual edits.

---

**Found it useful?** Star the repo — it helps others find it.

**Found a bug?** [Open an issue](https://github.com/talkstream/better-model/issues).

**Want to improve the matrix?** See [CONTRIBUTING.md](CONTRIBUTING.md).

## Requirements

- Node.js 18+
- A project using [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

## License

[MIT](LICENSE)
