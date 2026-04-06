# better-model

> **Stop sending grep to Opus.** Same quality — up to 40% faster AI responses.

Evidence-based model and effort selection for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Claude Code users on Max and Team Premium plans default to Opus 4.6 for every task — including file searches, grep operations, and simple questions. Real-world data shows that **93.8% of tokens go to Opus unnecessarily** ([#27665](https://github.com/anthropics/claude-code/issues/27665)). Yet Sonnet 4.6 delivers 98% of Opus's coding quality ([SWE-bench](https://www.swebench.com): 79.6% vs 80.9%).

By routing tasks to the right model, **better-model** cuts AI response times by ~30% on average (up to 40%) while maintaining full quality on the tasks that matter.

**How?** It installs a research-backed decision matrix into your project that teaches Claude Code when to use Opus, Sonnet, or Haiku — and at which effort level. No proxies, no hooks — just a `.md` file Claude reads.

## Quick start

```bash
npx better-model init
```

This places a `BETTER-MODEL.md` file in your project's `docs/` directory and adds a single reference line to your `CLAUDE.md`. Claude Code reads the matrix on every session and routes subagents accordingly.

## Commands

| Command | Description |
|---|---|
| `npx better-model init` | Install the decision matrix into your project |
| `npx better-model reset` | Remove better-model and restore defaults |
| `npx better-model status` | Check current installation status |
| `npx better-model --help` | Show help |
| `npx better-model --version` | Show version |

## The algorithm

The decision matrix is organized into three tiers based on published benchmarks and real-world community data:

### Tier 1 — Haiku (~20% of tasks)

Codebase exploration, file search, pattern matching. Use for short, focused subagent tasks that require no reasoning.

### Tier 2 — Sonnet (~60% of tasks)

The default for most coding work: code generation, feature implementation, test writing, simple refactoring (1–2 files), routine code review, and single-file debugging.

### Tier 3 — Opus (~20% of tasks)

Reserved for tasks where Sonnet has documented failure modes: multi-file refactoring (3+ files), cross-file debugging, architecture and system design, security audits, novel algorithm design, and large-context analysis (>200K tokens).

### Key rules

1. **Default to Sonnet + medium effort** — covers ~60% of tasks optimally.
2. **Escalate to Opus** when the task spans 3+ files with behavioral dependencies, requires expert-level reasoning, or has security implications.
3. **Downgrade to Haiku** for search and pattern-matching subagents.
4. **On Sonnet failure**, escalate to Opus — do not retry at higher effort. A stronger model at lower effort outperforms a weaker model at higher effort.

See the [full decision matrix](templates/BETTER-MODEL.md) for complete details, evidence links, and sources.

## How it works

`better-model` is deliberately simple:

1. **`init`** detects your project's documentation directory (`docs/`, `doc/`, or `documentation/`) and copies the decision matrix template there. It then adds a single reference line to your `CLAUDE.md` file (creating it if needed).

2. Claude Code reads `CLAUDE.md` at the start of every session, follows the reference, and loads the decision matrix. It then applies the matrix when spawning subagents via the `Agent` tool.

3. **`reset`** removes the template file and the reference line from `CLAUDE.md`, restoring your project to its default state.

No dependencies. No hooks. No configuration files. Just a `.md` file that Claude reads.

## What it changes

| File | Change |
|---|---|
| `docs/BETTER-MODEL.md` | Created — the decision matrix (editable) |
| `CLAUDE.md` | One line added — reference to the matrix |

Both changes are visible in `git diff` and fully version-controllable.

## Evidence base

The decision matrix draws on:

- [SWE-bench](https://www.swebench.com) — coding benchmark (Opus 80.9% vs Sonnet 79.6%)
- [GPQA Diamond](https://arxiv.org/abs/2311.12022) — expert reasoning (Opus 91.3% vs Sonnet 74.1%)
- [ARC-AGI-2](https://arcprize.org) — novel problem-solving (Opus 28.7% vs Sonnet 18.2%)
- [SonarSource](https://www.sonarsource.com/blog/) — AI code security analysis
- [CodeRabbit](https://www.coderabbit.ai/blog/) — LLM code review quality
- [RouteLLM](https://github.com/lm-sys/RouteLLM) — model routing research (ICLR)
- [Anthropic docs](https://docs.anthropic.com/en/docs/about-claude/models) — official model specifications
- Community data from [r/ClaudeAI](https://reddit.com/r/ClaudeAI), Hacker News, and X

## Requirements

- Node.js 18 or later
- A project using [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

## License

[MIT](LICENSE)
