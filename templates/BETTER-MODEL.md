# Better Model — Intelligent Model & Effort Selection for Claude Code

> **Purpose**: Teach Claude Code to pick the right model (Opus / Sonnet / Haiku) and effort level for every task — maximizing speed without sacrificing quality.
>
> **Last updated**: April 2026 · **Package**: [better-model](https://github.com/talkstream/better-model)

---

## Current Models at a Glance (April 2026)

| Model | Relative speed | SWE-bench | GPQA Diamond | Rate limit (TPM) | Best for |
|---|---|---|---|---|---|
| **Opus 4.6** | baseline | 80.9% | 91.3% | 30K | Architecture, security, novel problems, large context |
| **Sonnet 4.6** | ~1.4x faster | 79.6% | 74.1% | 90K | General coding, tests, reviews, refactoring (1–2 files) |
| **Haiku 4.5** | ~2x faster | — | — | 100K | Search, exploration, pattern matching |

**Key insight**: Sonnet delivers 98% of Opus's coding performance with faster responses and 3x the rate limit headroom. The real gap is in expert-level reasoning (GPQA: 17.2 points) and novel problem-solving (ARC-AGI-2: 10.5 points) — not in everyday coding. By routing ~80% of tasks away from Opus, you can expect **~30% faster AI responses on average (up to 40%)** with no quality loss on coding tasks.

---

## Instructions for Claude Code

When you spawn subagents via the `Agent` tool, **always set the `model` parameter** according to the matrix below. When choosing effort level, follow the guidance in the Effort column.

### Tier 1 — Haiku · ~20% of tasks · speed-critical, deterministic

Use Haiku for short, focused subagent tasks that require no reasoning.

| Task | Effort | Why |
|---|---|---|
| Codebase exploration / search | low | Built-in Explore agent already defaults to Haiku |
| File search, grep, glob | low | Deterministic — no reasoning needed |
| Pattern matching, format checks | low | Structural, not semantic |

**Haiku limitations**: unreliable beyond ~10–15 turns — may forget variable names or rename classes. Use only for short subagent bursts.

### Tier 2 — Sonnet · ~60% of tasks · the default for most coding

Use Sonnet for the majority of development work. It matches Opus on standard coding benchmarks.

| Task | Effort | Why |
|---|---|---|
| Single-file code generation | medium | Identical to Opus on SWE-bench |
| Feature implementation | medium | REST endpoints, CRUD, UI components work on first try |
| Test writing | medium | Good boundary-condition coverage; no Opus advantage |
| Simple refactoring (1–2 files) | medium | Rename, extract, update API patterns |
| Incident investigation | medium | Rootly benchmark: Sonnet matched or beat Opus |
| Tool use / MCP calls | medium | MCP-Atlas benchmark: Sonnet wins by 1 point |
| Code review (routine) | high | CodeRabbit data: moderate gap (Opus 50% vs Sonnet 41.5% important comments) |
| Single-file debugging | high | Sufficient for isolated, well-scoped bugs |

### Tier 3 — Opus · ~20% of tasks · when Sonnet demonstrably falls short

Reserve Opus for tasks where cheaper models have documented failure modes.

| Task | Effort | Why |
|---|---|---|
| Multi-file refactoring (3+ files) | high | Sonnet breaks behavioral dependencies silently (documented Redux→Zustand case) |
| Cross-file debugging | high | Sonnet enters circular fix loops on 5+ file issues |
| Architecture / system design | max | GPQA Diamond gap: 91.3% vs 74.1% — 17.2 points |
| Security audit | max | Opus catches middleware-order bugs and race conditions Sonnet misses |
| Novel algorithm design | max | ARC-AGI-2 gap: 28.7% vs 18.2% — 10.5 points |
| Large-context analysis (>200K tokens) | high | Sonnet degrades ~2% per 100K tokens; unreliable past 400K |

---

## Escalation & Fallback Rules

1. **Default to Sonnet + medium** — this covers ~60% of all tasks with optimal speed.
2. **Escalate to Opus when** the task spans 3+ files with behavioral dependencies, requires expert-level reasoning (GPQA-class), or has security implications.
3. **Downgrade to Haiku when** the task is primarily search, read, or pattern-match inside a short subagent.
4. **On Sonnet failure** (circular loop, ignored constraints, broken cross-file logic) → escalate to Opus immediately. Do **not** retry Sonnet at higher effort — research shows a stronger model at lower effort beats a weaker model at higher effort.
5. **Effort is not a model substitute**: "Sonnet high" ≠ "Opus medium". Opus at medium effort uses 76% fewer output tokens for the same SWE-bench score.

---

## Effort Level Reference

| Level | When to use | Notes |
|---|---|---|
| **low** | Lookups, file reads, formatting | Minimal reasoning |
| **medium** | Standard coding, tests, features | Default for Sonnet |
| **high** | Debugging, code review, multi-file work | Extended reasoning |
| **max** | Architecture, security, novel problems | Opus only; does not persist across turns |

---

## Agent Frontmatter Examples

Copy-paste these into your `.claude/agents/*.md` files to set model and effort per agent:

```yaml
# For code review agents (Tier 2 — Sonnet)
---
model: sonnet
effort: high
---

# For search/exploration agents (Tier 1 — Haiku)
---
model: haiku
effort: low
---

# For security/architecture agents (Tier 3 — Opus)
---
model: opus
effort: max
---
```

Run `npx better-model audit` to check which agents are missing `model:` settings.

## Session Model Guidance

The matrix above applies to **subagents**. For your own session model:

- If your current task is **Tier 2** work (feature implementation, tests, refactoring 1–2 files) and you're on Opus, consider switching: `/model sonnet`
- If you hit a **Tier 3** problem (architecture, multi-file debugging, security), switch back: `/model opus`
- Check your current model anytime: `/model`

---

## Anti-Patterns to Avoid

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Using Opus for everything | 93.8% of tokens wasted on trivial tasks | Follow the matrix above |
| Retrying Sonnet at higher effort when it fails on cross-file work | Effort cannot bridge the 17.2-point GPQA gap | Escalate to Opus |
| Using Haiku for long agent sessions | Loses context after ~15 turns | Use Sonnet for anything beyond quick searches |
| Trusting any model's code security | Opus 4.6 has +55% vulnerability density vs 4.5 (SonarSource) | Always run static analysis (Snyk, SonarQube) |
| Assuming opusplan routes correctly | Known bugs: silent Sonnet-only execution | Verify active model with `/model` |

---

## Sources & Credits

This decision matrix is based on published benchmarks, peer-reviewed studies, and real-world community data:

- **[SWE-bench](https://www.swebench.com)** — Opus 80.9% vs Sonnet 79.6% (verified subset)
- **[GPQA Diamond](https://arxiv.org/abs/2311.12022)** — Opus 91.3% vs Sonnet 74.1%
- **[ARC-AGI-2](https://arcprize.org)** — Opus 28.7% vs Sonnet 18.2%
- **[SonarSource AI Code Quality Study](https://www.sonarsource.com/blog/)** — vulnerability density analysis across models
- **[CodeRabbit Code Review Study](https://www.coderabbit.ai/blog/)** — LLM review comment quality comparison
- **[Rootly SRE Benchmark](https://rootly.com/blog/)** — AI incident investigation performance
- **[RouteLLM](https://github.com/lm-sys/RouteLLM)** — model routing framework and cost-quality research (ICLR)
- **[Claude Code Issue #27665](https://github.com/anthropics/claude-code/issues/27665)** — real token usage analysis from Max subscribers
- **[Anthropic Model Documentation](https://docs.anthropic.com/en/docs/about-claude/models)** — official model specifications
- **Community**: Reddit [r/ClaudeAI](https://reddit.com/r/ClaudeAI), Hacker News, and X/Twitter discussions

---

*Installed by [better-model](https://github.com/talkstream/better-model). Run `npx better-model reset` to remove.*
