# better-model

CLI tool that optimizes Claude Code model selection by installing an evidence-based decision matrix and injecting model/effort frontmatter into agents and skills.

See @README.md for full feature description and @CONTRIBUTING.md for contribution workflow.

## Commands

```bash
# Run full test suite (required before every commit)
node --test 'test/*.test.js'

# Run a single test file
node --test test/fix.test.js

# Test CLI locally
node bin/better-model.js --help
node bin/better-model.js init      # in a temp directory
node bin/better-model.js status
node bin/better-model.js audit
node bin/better-model.js reset
```

## Architecture

```
bin/better-model.js   Entry point — CLI router (switch on command)
src/detect.js         Finds docs dir, CLAUDE.md, checks install status
src/init.js           Install flow: agents, routing block, template, fix, git-add
src/reset.js          Remove agents, routing block, template, clean up empty dirs
src/status.js         Print install status
src/audit.js          Scan .claude/agents/ and skills/ for missing model frontmatter
src/fix.js            Inference engine + frontmatter injection
src/agents.js         Agent install/remove (sonnet-coder, haiku-explorer)
src/git.js            git-add helper (stages touched files automatically)
```

## Code Patterns

- **ES modules only** — `type: "module"` in package.json, use `import`/`export`
- **Zero dependencies** — only `node:` built-ins (fs, path, child_process, test, assert, os, url)
- **Every function has a JSDoc comment** with `@param` and `@returns`
- **All exports are named** — no default exports
- **Constants at module top** — CLAUDE_MD, TEMPLATE_FILE, REFERENCE_MARKER in detect.js
- **Tests create temp dirs** via `mkdtempSync` in `beforeEach`, clean up with `rmSync` in `afterEach`
- **node:test + node:assert/strict** — no Mocha, no Jest, no Vitest
- **Comments in English** in code

## Testing

- Tests use `node:test` describe/it/beforeEach/afterEach pattern
- Each test file mirrors a src file: `src/foo.js` → `test/foo.test.js`
- Tests operate on temp directories, never touch the real filesystem
- git.test.js initializes real git repos in tmp for integration tests
- CI runs on Node 18, 20, 22 via GitHub Actions (`.github/workflows/test.yml`)

## Publishing

- `npm publish` requires Touch ID (macOS keychain) — cannot be automated
- Bump version in package.json manually before publish
- `"files"` in package.json controls what ships: `bin/`, `src/`, `templates/`
- No build step — source ships directly

## Key Invariants

- `init` and `reset` are idempotent — safe to run multiple times
- `init` never overwrites existing template, duplicates routing block, or overwrites existing agents
- `init` on v0.4.0 projects upgrades single-line reference to routing block automatically
- `init` on v0.5.x projects upgrades the routing block to the current version automatically (detected via absence of `BLOCK_VERSION_MARKER`)
- `reset` preserves user content in CLAUDE.md — only removes the routing block
- `reset` removes only better-model agents (identified by marker), preserves user agents
- `reset` removes docs/ and .claude/agents/ directories only if empty after removal
- `fix` skips agents/skills that already have `model:` set — never overwrites user choices
- `fix` skips skills that delegate to an agent with model already set
- `gitAdd` silently skips non-git projects and gitignored files
- Every `ROUTING_BLOCK` carries a `BLOCK_VERSION_MARKER` comment inside its markers — future-proof signal for upgrade detection

## Inference Engine (src/fix.js)

The `inferModel()` function maps agent/skill names + descriptions to tiers (Opus 4.7 era):
- **Tier 1 (Haiku, low)**: explore, search, scan, grep, find, discover, verify, health, check, status, monitor
- **Tier 2 (Sonnet, high)**: lint, debug, investigate, diagnose
- **Tier 2 (Sonnet, medium)**: test, format, deploy, build, generate, refactor, pipeline
- **Tier 3 (Opus, max)**: architect, security, novel, algorithm — frontier reasoning
- **Tier 3 (Opus, xhigh)**: audit, migrate, migration, migrator, review — agentic coding (Anthropic's recommended starting point for Opus 4.7 coding work)
- **Default**: Sonnet, medium

Priority: Haiku → Opus max → Opus xhigh → Sonnet high → Sonnet medium → default.

Opus 4.7 specifically honours `low`/`medium` effort more literally than prior models — route agentic/coding work to `xhigh` (not `high`) to avoid shallow reasoning. `max` is reserved for novel/frontier tasks because Anthropic warns it can overthink on structured-output tasks like code review.

## Do NOT

- Add runtime dependencies — the zero-dependency constraint is a core selling point
- Use `rm` or `unlinkSync` on user files outside the known template path
- Modify user's CLAUDE.md content beyond the routing block (between better-model:start/end markers)
- Change the frontmatter injection to overwrite existing `model:` values
- Use CommonJS (`require`) anywhere
- Add a build/transpilation step — source ships as-is
- Skip the full test suite before committing
- Publish without testing on all three Node versions (18, 20, 22)
