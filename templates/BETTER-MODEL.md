# Better Model — Intelligent Model & Effort Selection for Claude Code

> **Purpose**: Teach Claude Code to pick the right model (Opus / Sonnet / Haiku) and effort level for every task — maximizing speed without sacrificing quality.
>
> **Last updated**: 2026-05-12 · **Package**: [better-model](https://github.com/talkstream/better-model)

---

## Current Models at a Glance (May 2026)

| Model | Rel. speed | SWE-bench Verified | SWE-bench Pro | GPQA Diamond | Context | Best for |
|---|---|---|---|---|---|---|
| **Opus 4.7** | baseline | 87.6% | 64.3% | 94.2% | 1M | Architecture, security, multi-file refactoring, novel problems |
| **Sonnet 4.6** | ~1.4× faster | 79.6% | n/a | 74.1% | 1M | General coding, tests, refactoring (1–2 files), tool use |
| **Haiku 4.5** | ~2× faster | — | — | — | 200K | Search, exploration, pattern matching |

**Key insight**: Opus 4.7 extended its lead on coding (SWE-bench Verified gap 8.0 pts, up from 1.3 pts on the previous generation) and on agentic work (SWE-bench Pro 64.3% vs 53.4% on Opus 4.6). But Sonnet 4.6 stays **5× cheaper** ($3/$15 vs $5/$25 per MTok) and handles ~60% of routine coding at ~91% of Opus quality. Opus earns its place on multi-file agentic tasks, expert reasoning (GPQA gap 20.1 pts), and code review (CodeRabbit 68/100 pass rate, +24% vs baseline). By routing ~80% of tasks away from Opus you keep the speedup and capture near-all of the quality.

> **Opus 4.7 caveats** (verified May 2026):
> 1. **New tokenizer — officially confirmed +35% on the high end.** [Anthropic pricing docs](https://platform.claude.com/docs/en/about-claude/pricing) state verbatim: "*Opus 4.7 uses a new tokenizer ... this new tokenizer may use up to 35% more tokens for the same fixed text.*" Code-heavy and structured-data prompts trend toward the ceiling (~1.30–1.35×); prose stays near 1.0×. Prompt caching (3× cheaper subagent-cache writes since Claude Code v2.1.133) partially offsets the cost. On long code-heavy prompts (>10K input tokens), prefer Sonnet 4.6 over Opus 4.7 when the quality gap is acceptable.
> 2. **Long-context regression — retrieval vs generation are different.** Past ~500K tokens, Opus 4.7 has a documented "lost in the middle" regression on multi-needle retrieval. The Anthropic system card and community measurements (WentuoAI, GitHub issues #53234, #55504) confirm Opus 4.6 dominates 4.7 on long-context retrieval. For **retrieval-heavy** workloads past 500K, prefer **Opus 4.6** (it's still GA, not deprecated). For **generation-heavy** workloads, prefer Sonnet 4.6 (1M context, no regression) or chunk the task.
> 3. **Stricter effort handling** — Opus 4.7 respects `low`/`medium` effort more literally than 4.6; if you see shallow reasoning on complex problems, raise effort rather than prompt around it.

---

## Instructions for Claude Code

When you spawn subagents via the `Agent` tool, **always set `model`** according to the matrix below. Set `effort` for Sonnet and Opus tiers; Haiku 4.5 does **not** support the `effort` parameter.

### Tier 1 — Haiku · ~20% of tasks · speed-critical, deterministic

Use Haiku for short, focused subagent tasks that require no reasoning.

| Task | Effort | Why |
|---|---|---|
| Codebase exploration / search | — | Built-in Explore agent already defaults to Haiku |
| File search, grep, glob | — | Deterministic — no reasoning needed |
| Pattern matching, format checks | — | Structural, not semantic |

**Haiku limitations**: unreliable beyond ~10–15 turns — may forget variable names or rename classes. Use only for short subagent bursts. Haiku 4.5 does **not** support the `effort` parameter — per [Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort), effort is supported only on Sonnet 4.6, Opus 4.6, Opus 4.7 (and Opus 4.5). Set `model: haiku` without any `effort` field.

### Tier 2 — Sonnet · ~60% of tasks · the default for most coding

Use Sonnet for the majority of development work. It delivers ~91% of Opus 4.7 coding quality at ~20% of the cost.

| Task | Effort | Why |
|---|---|---|
| Single-file code generation | medium | Anthropic-recommended default for Sonnet 4.6 |
| Feature implementation | medium | REST endpoints, CRUD, UI components work on first try |
| Test writing | medium | Good boundary-condition coverage; no Opus advantage |
| Simple refactoring (1–2 files) | medium | Rename, extract, update API patterns |
| Incident investigation | medium | Rootly benchmark: Sonnet matched or beat Opus |
| Tool use / MCP calls | medium | Solid on tool-heavy agentic workflows |
| Single-file debugging | high | Sufficient for isolated, well-scoped bugs |

### Tier 3 — Opus 4.7 · ~20% of tasks · where Sonnet demonstrably falls short

Reserve Opus 4.7 for tasks where cheaper models have documented failure modes. Most Tier-3 tasks default to **`xhigh`** effort (Anthropic's recommended starting point for coding and agentic work on 4.7). Reserve `max` for genuinely frontier reasoning — on structured-output tasks `max` can overthink without quality gain.

| Task | Effort | Why |
|---|---|---|
| Multi-file refactoring (3+ files) | xhigh | SWE-bench Pro +10.9 pts gen-on-gen; multi-file coherence is the biggest 4.7 improvement |
| Cross-file debugging | xhigh | Sonnet enters circular fix loops on 5+ file issues; Opus 4.7 tracks dependencies |
| Code review | xhigh | CodeRabbit: 68/100 pass rate vs baseline 55/100 (+24% relative); `xhigh` over `max` avoids overthinking on structured output |
| Migrations (DB / breaking API) | xhigh | Multi-step, stateful, agentic — `xhigh` is the sweet spot |
| Multi-agent orchestration | xhigh | Code-with-Claude-2026 pattern — lead agent delegates to specialists (Netflix early adopter) |
| Advisor strategy (frontier guidance) | xhigh | Smaller model calls Opus for guidance — ~5× cost reduction with frontier-quality output |
| Architecture / system design | max | GPQA Diamond gap: 94.2% vs 74.1% — 20.1 points |
| Security audit | max | Novel threat modeling; catches middleware-order bugs and race conditions Sonnet misses |
| Novel algorithm design | max | ARC-AGI-2 gap persists — genuine frontier reasoning |
| Architectural planning (ultraplan) | max | Anthropic cloud planning feature — architectural-level work warrants frontier reasoning |
| Large-context analysis 200K–500K | xhigh | Opus 4.7 has 1M context but honours effort strictly; `xhigh` keeps focus |
| Large-context > 500K, retrieval-heavy | — | **Prefer Opus 4.6** (still GA) — system card confirms 4.6 dominates 4.7 on multi-needle retrieval |
| Large-context > 500K, generation-heavy | — | **Prefer Sonnet 4.6** (no regression) or chunk the task |

---

## Escalation & Fallback Rules

1. **Default to Sonnet + medium** — this covers ~60% of all tasks with optimal speed-cost balance (matches Anthropic's recommended default for Sonnet 4.6).
2. **Escalate to Opus 4.7 + `xhigh`** when the task spans 3+ files with behavioral dependencies, requires expert-level reasoning, touches security, or is a multi-step agentic flow.
3. **Downgrade to Haiku** (model only, no effort field) when the task is primarily search, read, or pattern-match inside a short subagent.
4. **On Sonnet failure** (circular loop, ignored constraints, broken cross-file logic) → escalate to Opus 4.7 + `xhigh` immediately. Do **not** retry Sonnet at higher effort — a stronger model at lower effort beats a weaker model at higher effort.
5. **Reserve `max` for novel reasoning only** (architecture, security audit, novel algorithm). For code review, migrations, and multi-file refactoring, `xhigh` is the safer default — `max` can overthink on structured-output tasks.
6. **Effort is not a model substitute**: "Sonnet max" ≠ "Opus xhigh". Opus at medium uses 76% fewer output tokens for the same SWE-bench score than Sonnet at high.
7. **Avoid Opus 4.7 on >500K tokens** of live context — documented lost-in-the-middle regression; chunk the task or switch to Sonnet 4.6.

---

## Effort Level Reference

| Level | Availability | When to use | Notes |
|---|---|---|---|
| **low** | Sonnet / Opus | Lookups, file reads, formatting, 1-shot subagents | Minimal reasoning; Opus 4.7 scopes work strictly. **Not available on Haiku 4.5** — set `model: haiku` without `effort` |
| **medium** | Sonnet / Opus | Standard coding, tests, features | Anthropic-recommended default for Sonnet 4.6 |
| **high** | Sonnet / Opus | Debugging, solid tasks needing intelligence | API default; equivalent to not setting the parameter |
| **xhigh** | **Opus 4.7 only** | Coding, agentic work, repeated tool calls, 30+ min runs | Anthropic-recommended starting point for Opus 4.7 coding work |
| **max** | Sonnet / Opus | Architecture, security, novel algorithms | Reserved for frontier problems; may overthink on structured output |

Source: [Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort).

---

## Agent Frontmatter Examples

Copy-paste these into your `.claude/agents/*.md` files:

```yaml
# For general coding agents (Tier 2 — Sonnet, the default)
---
model: sonnet
effort: medium
---

# For search / exploration agents (Tier 1 — Haiku, no effort field)
---
model: haiku
---

# For code review / multi-file refactoring / migration agents (Tier 3 — Opus 4.7)
---
model: opus
effort: xhigh
---

# For architecture / security / novel-algorithm agents (Tier 3 — Opus 4.7)
---
model: opus
effort: max
---
```

Run `npx better-model audit` to check which agents are missing `model:` or `effort:` settings. `npx better-model audit --fix` injects the inferred values.

## Session Model Guidance

The matrix above applies to **subagents**. For your own Claude Code session model:

- On **Tier 2** work (feature implementation, tests, 1–2 file refactoring) and you're on Opus, consider switching: `/model sonnet`
- On **Tier 3** (architecture, multi-file debugging, security), switch back: `/model opus`
- For Opus 4.7 coding work, raise effort: `/effort xhigh`
- Current model: `/model`

---

## Other Claude Code routing primitives

better-model focuses on subagent dispatch. Claude Code itself ships several complementary mechanisms that compose with the routing block:

- **`opusplan` alias** — `/model opusplan` uses Opus during plan mode and Sonnet during execution. Cost-aware session-level routing without manual switching. Verify with `/model` before risky operations (the anti-pattern table below documents historical bugs).
- **`${CLAUDE_EFFORT}` skill substitution** (Claude Code v2.1.120+) — skills can interpolate the current session effort into their content. Useful for skills that construct prompts which should adapt to the session-wide effort knob.
- **`CLAUDE_CODE_SUBAGENT_MODEL` env var** — global override for the model used by ALL subagent calls. Useful for "everything-Haiku" cost-control experiments. Use sparingly — better-model's per-agent frontmatter is the more precise tool.
- **`task_budget` parameter** (beta, header `task-budgets-2026-03-13`, min 20K tokens) — advisory cost ceiling for long-running agentic loops. Anthropic quote: *"a rough estimate of how many tokens to target for a full agentic loop, including thinking, tool calls, tool results, and final output."* Complements `effort` (which sets depth-per-call); `task_budget` sets a ceiling across the whole loop.
- **Hooks receive `effort.level`** (Claude Code v2.1.133+) — `PreToolUse` / `PostToolUse` hooks now see the active effort level via `$CLAUDE_EFFORT` env var. Useful for telemetry and per-effort cost accounting (observation only — main-session effort can't be auto-switched from a hook).

These primitives recommend depth or budget; better-model's routing block recommends which model. Use them together.

---

## Anti-Patterns to Avoid

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Using Opus for everything | Observed 93.8% of tokens wasted on trivial tasks (issue #27665) | Follow the matrix; route 80% to Sonnet/Haiku |
| Retrying Sonnet at higher effort when it fails cross-file | Effort cannot bridge the 20.1-pt GPQA gap | Escalate to Opus 4.7 + xhigh |
| Using `max` for code review or migrations | Opus 4.7 may overthink on structured output | Use `xhigh` — Anthropic-recommended for agentic/coding |
| Using Haiku for long agent sessions | Loses context after ~15 turns | Use Sonnet for anything beyond quick searches |
| Feeding Opus 4.7 > 500K live context | "Lost in the middle" regression | Chunk the task or use Sonnet 4.6 |
| Trusting any model's code security | Opus 4.6 had +55% vuln density vs 4.5 (SonarSource); 4.7 not re-benchmarked | Always run static analysis (Snyk, SonarQube) |
| Assuming opusplan routes correctly | Known bugs: silent Sonnet-only execution | Verify active model with `/model` |

---

## Sources & Credits

This decision matrix is based on published benchmarks and official Anthropic documentation:

- **[SWE-bench Verified](https://www.swebench.com)** — Opus 4.7 87.6% vs Sonnet 4.6 79.6% (April 16, 2026 release)
- **[SWE-bench Pro](https://www.swebench.com)** — Opus 4.7 64.3% (+10.9 pts gen-on-gen)
- **[Terminal-Bench 2.0](https://www.anthropic.com/news/claude-opus-4-7)** — Opus 4.7 69.4% (tool-use / agentic)
- **[GPQA Diamond](https://arxiv.org/abs/2311.12022)** — Opus 4.7 94.2% vs Sonnet 4.6 74.1%
- **[ARC-AGI-2](https://arcprize.org)** — Opus 4.6 28.7% vs Sonnet 4.6 18.2% (Opus 4.7 result pending publication)
- **[MCP-Atlas](https://www.anthropic.com/news/claude-opus-4-7)** — Opus 4.7 77.3% (agentic tool use, +14.6 pts vs 4.6)
- **[CodeRabbit code review study](https://www.coderabbit.ai/blog/claude-opus-4-7-for-ai-code-review)** — Opus 4.7 pass rate 68/100 vs baseline 55/100 (+24% relative)
- **[Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)** — `xhigh` recommended for Opus 4.7 coding/agentic; **Haiku 4.5 explicitly absent from the supported-models list** (this is what drove the v0.7.0 Haiku effort removal)
- **[Anthropic pricing docs](https://platform.claude.com/docs/en/about-claude/pricing)** — verbatim confirmation of "up to 35% more tokens for the same fixed text" on the Opus 4.7 tokenizer
- **[Anthropic Opus 4.7 announcement](https://www.anthropic.com/news/claude-opus-4-7)** — release notes, benchmark summary
- **[Anthropic April 23 postmortem](https://www.anthropic.com/engineering/april-23-postmortem)** — three quality bugs (effort default flip, thinking-cache bug, verbosity prompt) that degraded Claude Code March–April 2026; all reverted by April 20
- **[Anthropic Models overview](https://docs.anthropic.com/en/docs/about-claude/models)** — official specs, context windows, pricing
- **[Claude Code changelog](https://code.claude.com/docs/en/changelog)** — v2.1.111 shipped `xhigh` + `/effort` slider (April 16, 2026); v2.1.120 added `${CLAUDE_EFFORT}` in skills; v2.1.133 added effort.level to hooks + 3× subagent cache reduction
- **[Code with Claude 2026 announcements](https://simonwillison.net/2026/May/6/code-w-claude-2026/)** — multi-agent orchestration, Outcomes (rubric grading), Dreaming (memory curation), Advisor strategy
- **[RouteLLM](https://github.com/lm-sys/RouteLLM)** — model routing framework and cost-quality research (ICLR)
- **[Claude Code Issue #27665](https://github.com/anthropics/claude-code/issues/27665)** — real token usage analysis from Max subscribers

---

*Installed by [better-model](https://github.com/talkstream/better-model). Run `npx better-model reset` to remove.*
