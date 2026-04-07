# Design: Custom Agents for better-model v0.5.0

## Context

**Problem:** better-model v0.4.0 installs a decision matrix (BETTER-MODEL.md) and can inject `model:`/`effort:` frontmatter into existing `.claude/agents/` files. However, most projects have zero custom agents — enforcement mode has nothing to enforce.

**Evidence from field data (April 7, 2026):**
- 8 sessions, 3,194 API calls across 5 projects
- Actual distribution: Opus 71.2%, Haiku 22.2%, Sonnet 6.6%
- Recommended distribution: Opus 20%, Sonnet 60%, Haiku 20%
- Sonnet underutilization: 6.6% vs 60% target (53.4% gap)
- 22% Haiku is Claude Code's native Explore behavior, not better-model's contribution
- Speed savings: 12.6% actual vs 27.1% potential

**Root cause:** Without `.claude/agents/` files carrying `model:` frontmatter, Claude Code defaults all subagent tasks to the session model (Opus for Max subscribers). CLAUDE.md instructions achieve ~70% compliance; frontmatter achieves ~100%.

**Competitive context:**
- claude-code-router (31.7k GitHub stars) — proxy-based, manual config, no intelligence
- Cursor "Auto" — MoE-based routing, most sophisticated
- Gemini CLI — auto-routing (Flash vs Pro) with local Gemma for decisions
- Claude Code has no built-in intelligent routing (issue #27665, no Anthropic response)
- RouteLLM research (UC Berkeley): 85% cost savings at 95% quality retention

**Solution:** Ship 2 custom agents + enhanced CLAUDE.md block as part of `npx better-model init`.

---

## Approach: Hybrid (Agents + Enhanced CLAUDE.md)

Two custom agents with `model:` frontmatter (100% enforcement) plus a strengthened CLAUDE.md instruction block (85% compliance for non-agent paths). Double coverage.

### Why not alternatives?

| Rejected approach | Why |
|---|---|
| 5 task-specific agents | High conflict risk (`code-reviewer` is common name), more files, diminishing returns |
| Template menu (`agents` command) | Over-engineering for 2 agents, most users take the default anyway |
| CLAUDE.md-only enhancement | ~70-85% compliance ceiling, no structural enforcement |
| Single agent | Misses Haiku tier, less dispatch accuracy |

---

## Agent Definitions

### `.claude/agents/sonnet-coder.md`

```markdown
---
name: sonnet-coder
description: General-purpose coding agent for implementing features, writing tests, refactoring, and debugging in 1-2 files. Use for any coding subagent task that does not require multi-file architecture (3+ files with behavioral dependencies), security audit, code review, or novel algorithm design.
model: sonnet
effort: medium
---

# Sonnet Coder

Handle this coding task efficiently following existing project patterns.

## Scope
- Feature implementation, bug fixes, code modifications
- Unit and integration test writing
- Refactoring within 1-2 files
- Documentation updates tied to code changes

## Escalation
If the task requires changes across 3+ files with behavioral dependencies,
architecture decisions, security implications, or code review — report this
to the user. Do not attempt Opus-tier work.

<!-- installed by better-model — do not edit this line -->
```

### `.claude/agents/haiku-explorer.md`

```markdown
---
name: haiku-explorer
description: Fast read-only codebase exploration agent for file search, code grep, pattern matching, reading file contents, checking project structure, and git history analysis. Never modifies files.
model: haiku
effort: low
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Haiku Explorer

Search the codebase and report findings. Be fast and concise.

- Find files, functions, patterns, or dependencies as requested
- Report with file paths and line numbers
- Do NOT modify any files
- Keep responses brief — facts only, no analysis

<!-- installed by better-model — do not edit this line -->
```

### Agent marker

All better-model agents end with:
```
<!-- installed by better-model — do not edit this line -->
```

This marker is used by `reset` and `removeAgents` to identify and safely remove only better-model's agents, never user-created ones.

---

## Enhanced CLAUDE.md Block

Replaces the current single-line reference:

```markdown
<!-- better-model:start -->
## Model Routing (better-model)

**CRITICAL**: When spawning subagents via the Agent tool, ALWAYS set the `model` and `effort` parameters:
- `model: "haiku", effort: "low"` — search, grep, file reading, exploration, status checks
- `model: "sonnet", effort: "medium"` — code generation, tests, refactoring, bug fixes (1-2 files)
- `model: "opus", effort: "high"` — multi-file refactoring (3+ files), architecture, security audits
- `model: "opus", effort: "max"` — **code review**

Default to `model: "sonnet", effort: "medium"` when unsure.
See [full decision matrix](docs/BETTER-MODEL.md).
<!-- better-model:end -->
```

**Reset logic:** Find `<!-- better-model:start -->` to `<!-- better-model:end -->`, remove inclusive. Fallback to current single-line detection for backward compatibility with v0.4.0 installs.

### Migration from v0.4.0

When `init` runs on a project with v0.4.0 single-line reference:
1. Detect old reference line (contains `BETTER-MODEL.md` but no `<!-- better-model:start -->`)
2. Remove the old single-line reference
3. Insert the new multi-line block at the same position
4. `getInstallStatus()` continues using `REFERENCE_MARKER = "BETTER-MODEL.md"` for detection (present in both formats)
5. New constants: `BLOCK_START = '<!-- better-model:start -->'`, `BLOCK_END = '<!-- better-model:end -->'`

### Invariant update

This changes the documented invariant from "one .md file + one reference line" to "one .md file + one routing block + optional agents". The following project files must be updated:
- `CLAUDE.md` "Key Invariants" section — update reference line description
- `CLAUDE.md` "Do NOT" section — change "beyond reference line" to "beyond routing block"
- `CONTRIBUTING.md` — update "Minimal footprint" description

---

## Code Architecture

### New file: `src/agents.js` (~120 lines)

```
Exports:
  AGENT_MARKER: string
  AGENTS: Array<{ filename: string, content: string }>
  installAgents(projectRoot: string): { installed: string[], skipped: string[] }
  removeAgents(projectRoot: string): { removed: string[], kept: string[] }
```

**`installAgents` logic:**
1. Create `.claude/agents/` with `mkdirSync({ recursive: true })`
2. For each agent in `AGENTS`:
   - If filename already exists → skip (never overwrite)
   - If any existing `.md` in agents/ has matching `name:` in frontmatter → skip
   - Otherwise → write file
3. Return results for reporting

**`removeAgents` logic:**
1. Read all `.md` files in `.claude/agents/`
2. For each: contains `AGENT_MARKER`? → delete with `unlinkSync`
3. If `.claude/agents/` is now empty → remove directory
4. Return results for reporting

### Modified files

| File | Changes |
|---|---|
| `src/init.js` | Import `installAgents`; call after CLAUDE.md update, before `fix()`; skip on `--soft`; add agent paths to `touchedFiles` for git-add; replace `REFERENCE_LINE` with multi-line block using HTML comment markers |
| `src/reset.js` | Import `removeAgents`; call before template removal; update CLAUDE.md removal for multi-line block (find start/end markers); keep backward compatibility for v0.4.0 single-line reference |
| `src/detect.js` | Add `getInstalledAgents(projectRoot)` function; update `getInstallStatus` return type to include `agents: string[]` |
| `src/status.js` | Display installed agents in status output |
| `src/audit.js` | Include better-model agents in audit report (they should always pass) |
| `src/fix.js` | Move `review` keyword from Sonnet-high tier to Opus-high tier; export `parseFrontmatter()` for reuse by agents.js |
| `templates/BETTER-MODEL.md` | Move ALL code review from Tier 2 (Sonnet) to Tier 3 (Opus); remove "(routine)" qualifier; update task tables |
| `bin/better-model.js` | Update `printHelp()` — init description mentions agent creation |
| `CLAUDE.md` | Update "Key Invariants" and "Do NOT" sections for multi-line block |
| `CONTRIBUTING.md` | Update "Minimal footprint" description |

### Inference engine update (`src/fix.js`)

Current keyword tiers:
```
Tier 1 (Haiku):    explore, search, scan, grep, find, discover, verify, health, check, status, monitor
Tier 3 (Opus):     architect, security, audit, migrate, migration
Tier 2-high:       review, lint, debug, investigate, diagnose
Tier 2-medium:     test, format, deploy, build, generate, refactor, pipeline
```

Updated:
```
Tier 1 (Haiku):    explore, search, scan, grep, find, discover, verify, health, check, status, monitor
Tier 3 (Opus):     architect, security, audit, migrate, migration, review
Tier 2-high:       lint, debug, investigate, diagnose
Tier 2-medium:     test, format, deploy, build, generate, refactor, pipeline
```

`review` moves from Tier 2-high (Sonnet) to Tier 3 (Opus).

---

## Conflict Resolution

| Scenario | Behavior |
|---|---|
| File `sonnet-coder.md` already exists | Skip — never overwrite |
| Different file but `name: sonnet-coder` in frontmatter | Skip — name collision detected |
| User has `code-reviewer.md` | No conflict — different name |
| User has agents without `model:` field | better-model's `fix()` will inject model via enforcement (existing behavior) |
| Re-running `init` on already-installed project | Idempotent — skip existing agents, no duplicates |

---

## Testing

### New: `test/agents.test.js` (~10 tests)

1. Creates agents in empty project
2. Creates `.claude/agents/` directory when missing
3. Skips agent when filename exists (idempotent)
4. Skips agent when `name:` field conflicts in different file
5. Agent files have correct `model:` and `effort:` frontmatter
6. Agent files contain `AGENT_MARKER`
7. `removeAgents` removes only marked agents
8. `removeAgents` preserves unmarked (user) agents
9. `removeAgents` removes empty `.claude/agents/` directory
10. Double install is idempotent (no duplicates)

### Updated existing tests

| File | New tests |
|---|---|
| `test/init.test.js` | +2: init creates agents; init `--soft` skips agents |
| `test/reset.test.js` | +2: reset removes better-model agents; reset preserves user agents |
| `test/fix.test.js` | Modify existing `review` assertion from sonnet/high to opus/high (not a new test — fixes existing test) |

**Total: 51 → 65 tests** (10 new agents + 2 init + 2 reset = 14 new; 1 existing fix.test modified)

---

## Verification Plan

1. **Unit tests:** `node --test` — all 66 tests green
2. **CLI integration:**
   - `npx better-model init` in test project → agents created, CLAUDE.md block added
   - `npx better-model status` → shows installed agents
   - `npx better-model audit` → agents pass (have model/effort)
   - `npx better-model reset` → agents removed, user agents preserved, CLAUDE.md block removed
3. **Idempotency:** `init` → `init` → no duplicates, no errors
4. **Backward compatibility:** `reset` on v0.4.0 install (single-line reference) → works correctly
5. **Soft mode:** `init --soft` → no agents created, but CLAUDE.md routing block IS added (provides guidance without enforcement)
6. **Conflict handling:** Create user agent with `name: sonnet-coder` → `init` skips it
7. **Field test:** Run Claude Code session with installed agents → verify subagent calls route to Sonnet/Haiku
8. **Snyk scan:** Run `snyk_code_scan` on new `src/agents.js`
9. **CI:** Tests pass on Node 18, 20, 22

---

## Expected Impact

| Metric | Before (v0.4.0) | After (v0.5.0) | Target |
|---|---|---|---|
| Opus % | 71.2% | 25-30% | 20% |
| Sonnet % | 6.6% | 50-55% | 60% |
| Haiku % | 22.2% | 20% | 20% |
| Speed savings | 12.6% | ~25% | 27.1% |
| New source files | — | 1 (agents.js) | — |
| New tests | — | ~15 | — |
| Lines of new code | — | ~150 | — |
