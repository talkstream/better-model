# better-model

**Stop waiting for Opus on every grep.**

93.8% of Claude Code tokens go to Opus unnecessarily. better-model routes tasks to the right model — up to 40% faster AI responses, same code quality.

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

Sonnet handles all of these just as well — in half the time.

| Metric | Opus 4.6 | Sonnet 4.6 | Difference |
|---|---|---|---|
| [SWE-bench](https://www.swebench.com) (coding) | 80.9% | 79.6% | -1.3 points |
| Response speed | baseline | ~1.4x faster | you feel this |
| Rate limit (TPM) | 30K | 90K | 3x headroom |
| [GPQA Diamond](https://arxiv.org/abs/2311.12022) (reasoning) | 91.3% | 74.1% | Opus wins here |

The gap only matters for architecture, security audits, multi-file refactoring, and novel problem-solving. That's ~20% of tasks. better-model routes the other 80% to where they belong.

## How it works

**Step 1.** Run `npx better-model init` in your project.

**Step 2.** It drops a decision matrix into `docs/BETTER-MODEL.md`, adds one line to `CLAUDE.md`, and injects `model:` frontmatter into your `.claude/agents/` and `.claude/skills/`.

**Step 3.** Claude Code reads the matrix at session start and routes tasks to the right model.

That's it. No dependencies, no proxies, no hooks. One `.md` file and correct frontmatter.

## Two modes

| Mode | Command | What it does |
|---|---|---|
| **Enforcement** (default) | `npx better-model init` | Matrix + inject `model:` and `effort:` into agents/skills |
| **Soft** | `npx better-model init --soft` | Matrix as reference only — no frontmatter changes |

> [!TIP]
> In a [field test](https://github.com/talkstream/better-model), a Claude Code session read the decision matrix in soft mode and **proactively updated agent configs on its own** — applying the correct model to all 8 agents and skills without `audit --fix` being run.

## Commands

| Command | Description |
|---|---|
| `npx better-model init` | Install with enforcement (default) |
| `npx better-model init --soft` | Install soft mode — reference only |
| `npx better-model audit` | Report agents/skills missing model settings |
| `npx better-model audit --fix` | Auto-inject model frontmatter |
| `npx better-model reset` | Remove better-model and restore defaults |
| `npx better-model status` | Check installation status |

## The algorithm

The decision matrix organizes tasks into three tiers based on published benchmarks:

<details>
<summary><strong>Tier 1 — Haiku (~20% of tasks)</strong></summary>

Codebase exploration, file search, pattern matching. Short, focused subagent tasks that require no reasoning.

**Limitation**: unreliable beyond ~15 turns. Use only for quick subagent bursts.
</details>

<details>
<summary><strong>Tier 2 — Sonnet (~60% of tasks)</strong></summary>

The default for most coding: code generation, feature implementation, test writing, simple refactoring (1–2 files), routine code review, single-file debugging.

Sonnet delivers 98% of Opus's coding quality at 1.4x the speed.
</details>

<details>
<summary><strong>Tier 3 — Opus (~20% of tasks)</strong></summary>

Reserved for tasks where Sonnet has documented failure modes: multi-file refactoring (3+ files with behavioral dependencies), cross-file debugging, architecture design, security audits, novel algorithm design, large-context analysis (>200K tokens).

The GPQA gap (17.2 points) and ARC-AGI-2 gap (10.5 points) are real — Opus earns its place here.
</details>

### Key rules

1. **Default to Sonnet + medium effort** — covers ~60% of tasks.
2. **Escalate to Opus** when the task spans 3+ files, requires expert reasoning, or has security implications.
3. **Downgrade to Haiku** for search and pattern-matching subagents.
4. **On Sonnet failure**, escalate to Opus — don't retry at higher effort. A stronger model at lower effort outperforms a weaker model at higher effort.

See the [full decision matrix](templates/BETTER-MODEL.md) for complete details and evidence.

## Why not just write CLAUDE.md rules yourself?

You can! better-model is just a well-researched starting point:

- **Evidence-based**: every routing rule cites published benchmarks, not vibes
- **Enforcement mode**: actually injects `model:` frontmatter — CLAUDE.md alone is ~70% compliance, frontmatter is 100%
- **Inference engine**: maps agent names to the right tier automatically (review → Sonnet, migrate → Opus, scan → Haiku)
- **Maintained**: as models and benchmarks evolve, `npx better-model@latest init` gets you the updated matrix
- **Reversible**: `npx better-model reset` removes everything cleanly

## Evidence base

- [SWE-bench](https://www.swebench.com) — Opus 80.9% vs Sonnet 79.6%
- [GPQA Diamond](https://arxiv.org/abs/2311.12022) — Opus 91.3% vs Sonnet 74.1%
- [ARC-AGI-2](https://arcprize.org) — Opus 28.7% vs Sonnet 18.2%
- [SonarSource](https://www.sonarsource.com/blog/) — AI code security analysis
- [CodeRabbit](https://www.coderabbit.ai/blog/) — LLM code review quality
- [RouteLLM](https://github.com/lm-sys/RouteLLM) — model routing research (ICLR)
- [Claude Code #27665](https://github.com/anthropics/claude-code/issues/27665) — real token usage data
- [Anthropic docs](https://docs.anthropic.com/en/docs/about-claude/models) — official model specs

## Get started

```bash
npx better-model init
```

Then start a Claude Code session. Watch it pick Sonnet for your next grep.

---

**Found it useful?** Star the repo — it helps others find it.

**Found a bug?** [Open an issue](https://github.com/talkstream/better-model/issues).

**Want to improve the matrix?** See [CONTRIBUTING.md](CONTRIBUTING.md).

## Requirements

- Node.js 18+
- A project using [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

## License

[MIT](LICENSE)
