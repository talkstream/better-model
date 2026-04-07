# Design: Issue #27665 Comment + Auto-Upgrade v0.4.0 → v0.5.0

## Context

Two post-release tasks for better-model v0.5.0:

1. **Community visibility** — post a data-driven comment on anthropics/claude-code#27665 (the central model routing issue, 8 thumbs-up, 14 subscribers, 0 Anthropic response). Self-promotion precedent already set (oussama-kh posted mcp-llama-swap on 2026-04-06).

2. **Auto-upgrade** — `npx better-model init` on a v0.4.0 project currently requires `reset && init` to upgrade the CLAUDE.md reference to the routing block. Users shouldn't need this.

---

## Part 1: Issue Comment

### Content

Structured as: confirm the problem → present workaround → link to tool.

```markdown
### Field data — confirming the problem

Ran analysis on my own Max sessions (April 7, 2026):
- **8 sessions, 3,194 API calls** across 5 projects
- Opus: **71.2%** of calls, 71.9% of output tokens
- Sonnet: **6.6%** (target: 60%)
- Haiku: 22.2% (Claude Code's native Explore agent)

This confirms the issue author's findings — Opus dominates even where
Sonnet performs identically (SWE-bench: 80.9% vs 79.6%).

### Workaround via `.claude/agents/` frontmatter

Built [better-model](https://github.com/talkstream/better-model) —
zero-dependency CLI that installs custom agents with `model:` frontmatter
and a CRITICAL routing block in CLAUDE.md:

\`\`\`bash
npx better-model init
\`\`\`

What it does:
- Ships `sonnet-coder` (model: sonnet) and `haiku-explorer` (model: haiku) agents
- Adds routing block to CLAUDE.md with effort levels per tier
- Frontmatter enforcement gives ~100% compliance vs ~70% from CLAUDE.md instructions alone

Evidence-based routing matrix citing SWE-bench, GPQA Diamond, ARC-AGI-2,
RouteLLM research. Expected improvement: Opus 71% → ~25-30%.

Not a replacement for proper built-in routing (which this issue requests),
but a functional workaround using existing Claude Code primitives.
```

### Posting

Use `gh issue comment 27665 --repo anthropics/claude-code --body "..."`.

---

## Part 2: Auto-Upgrade

### Problem

When `init` runs on a v0.4.0 project (`status.installed === true`), it enters the "already installed" branch which installs missing agents and runs enforcement, but never touches CLAUDE.md content. The upgrade code (OLD_REFERENCE_LINE → ROUTING_BLOCK replacement) exists in the "fresh install" branch but is unreachable.

### Solution

Add CLAUDE.md upgrade check to the "already installed" branch in `src/init.js`.

### Changes

**`src/init.js`** — in the `status.installed` branch (after printing status, before enforcement):

```javascript
// Upgrade v0.4.0 reference to v0.5.0 routing block
const claudeMdPath = join(projectRoot, CLAUDE_MD);
if (existsSync(claudeMdPath)) {
  let content = readFileSync(claudeMdPath, "utf8");
  if (!content.includes(BLOCK_START) && content.includes(OLD_REFERENCE_LINE)) {
    content = content.replace(OLD_REFERENCE_LINE, ROUTING_BLOCK);
    writeFileSync(claudeMdPath, content);
    touchedFiles.push(CLAUDE_MD);
    console.log("  Upgraded CLAUDE.md reference to routing block.");
  }
}
```

**`test/init.test.js`** — +1 test:

```javascript
it("upgrades v0.4.0 reference to routing block on re-init", () => {
  // Simulate v0.4.0 install: template + old reference line
  mkdirSync(join(tmp, "docs"), { recursive: true });
  copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
  writeFileSync(join(tmp, "CLAUDE.md"),
    '# Project\n\n→ **[Model Selection Guide](docs/BETTER-MODEL.md)** — when to use Opus/Sonnet/Haiku and effort levels\n');

  init(tmp);

  const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
  assert.ok(content.includes("<!-- better-model:start -->"));
  assert.ok(!content.includes("→ **[Model Selection Guide]"));
});
```

### Edge cases

| Scenario | Behavior |
|---|---|
| v0.5.0 already has routing block | `includes(BLOCK_START)` → skip |
| v0.4.0 reference was edited by user | `includes(OLD_REFERENCE_LINE)` fails → nothing happens → safe |
| Both old reference and new block | `includes(BLOCK_START)` → skip (block wins) |
| No CLAUDE.md | Can't happen in "already installed" branch (requires reference) |

### Version bump

Bump to **0.5.1** in package.json. CHANGELOG entry: "Auto-upgrade: `init` on v0.4.0 projects now upgrades CLAUDE.md reference to routing block automatically."

---

## Verification

1. `node --test` — all tests green
2. Create temp project with v0.4.0 layout → `init` → verify routing block replaces old reference
3. Re-run `init` → idempotent (no double block)
4. `gh issue comment` → verify comment appears on #27665
