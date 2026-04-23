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

## Early results

Field test on real Max subscriber sessions (April 7–9, 2026) with better-model v0.5.0 on Opus 4.6:

```
                Before agents          After agents          Delta
                6,707 API calls        1,967 API calls

Opus            79.4%                  73.2%                 -6.2pp
Sonnet           1.6%                  21.1%                +19.6pp
Haiku           19.1%                   5.6%                -13.4pp
```

Sonnet usage increased **13×** from baseline. Cost per API call dropped **~21%**. Data collected across 5 projects with v0.5.0 agents installed.

> These are early results from a single user on v0.5.0 (Opus 4.6 era). Your mileage may vary depending on task mix and project complexity. v0.6.0 (Opus 4.7 + xhigh) is expected to maintain or improve these gains — updated field data will land in v0.6.1.

## Two modes

| Mode | Command | What it does |
|---|---|---|
| **Enforcement** (default) | `npx better-model init` | Agents + routing block + inject `model:`/`effort:` into agents/skills (opus-tier → `xhigh`/`max`) |
| **Soft** | `npx better-model init --soft` | Matrix as reference only — no agents, no frontmatter changes |

> [!TIP]
> In a [field test](https://github.com/talkstream/better-model), a Claude Code session read the decision matrix in soft mode and **proactively updated agent configs on its own** — applying the correct model to all 8 agents and skills without `audit --fix` being run.

## Commands

| Command | Description |
|---|---|
| `npx better-model init` | Install with enforcement (default) |
| `npx better-model init --soft` | Install soft mode — reference only |
| `npx better-model audit` | Report agents/skills missing model settings |
| `npx better-model audit --fix` | Auto-inject model/effort frontmatter |
| `npx better-model reset` | Remove better-model and restore defaults |
| `npx better-model status` | Check installation status |

## The algorithm

The decision matrix organizes tasks into three tiers based on published benchmarks:

<details>
<summary><strong>Tier 1 — Haiku 4.5 (~20% of tasks)</strong></summary>

Codebase exploration, file search, pattern matching. Short, focused subagent tasks that require no reasoning.

**Limitation**: unreliable beyond ~15 turns. Use only for quick subagent bursts. Default effort: `low`.
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
4. **Downgrade to Haiku + `low`** for search and pattern-matching subagents.
5. **On Sonnet failure**, escalate to Opus 4.7 — don't retry Sonnet at higher effort. A stronger model at lower effort outperforms a weaker model at higher effort.
6. **Avoid Opus 4.7 on >500K tokens** of live context — documented lost-in-the-middle regression; chunk the task or use Sonnet 4.6.

See the [full decision matrix](templates/BETTER-MODEL.md) for complete details and evidence.

## Why not just write CLAUDE.md rules yourself?

You can! better-model is just a well-researched starting point:

- **Evidence-based**: every routing rule cites published benchmarks (Anthropic, LLM-Stats, CodeRabbit), not vibes
- **Ships ready-to-use agents**: `sonnet-coder` (model: sonnet, effort: medium) and `haiku-explorer` (model: haiku, effort: low) — 100% compliance vs ~70% from CLAUDE.md alone
- **Inference engine**: maps agent names to the right tier automatically (review → Opus + xhigh, architect → Opus + max, scan → Haiku + low)
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

### Upgrading from v0.5.x

```bash
npx better-model@latest init
```

The v0.6.0 `init` recognises your v0.5.x routing block and upgrades it in place — no `reset` needed. Agents (`sonnet-coder`, `haiku-explorer`) remain unchanged; only the CLAUDE.md routing block is updated to the Opus 4.7 + `xhigh`/`max` mapping.

### Upgrading from v0.4.x

```bash
npx better-model@latest init
```

The single-line reference from v0.4.x is automatically replaced with the full v0.6.0 routing block in a single step — no data loss, no manual edits.

---

**Found it useful?** Star the repo — it helps others find it.

**Found a bug?** [Open an issue](https://github.com/talkstream/better-model/issues).

**Want to improve the matrix?** See [CONTRIBUTING.md](CONTRIBUTING.md).

## Requirements

- Node.js 18+
- A project using [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

## License

[MIT](LICENSE)
