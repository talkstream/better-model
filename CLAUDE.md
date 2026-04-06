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
src/init.js           Install flow: copy template, add reference, run fix, git-add
src/reset.js          Remove template + reference, clean up empty dirs
src/status.js         Print install status
src/audit.js          Scan .claude/agents/ and skills/ for missing model frontmatter
src/fix.js            Inference engine + frontmatter injection
src/git.js            git-add helper (stages touched files automatically)
templates/BETTER-MODEL.md   The decision matrix template copied into user projects
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
- `init` never overwrites existing template or duplicates CLAUDE.md reference
- `reset` preserves user content in CLAUDE.md — only removes the reference line
- `reset` removes docs/ directory only if empty after template removal
- `fix` skips agents/skills that already have `model:` set — never overwrites user choices
- `fix` skips skills that delegate to an agent with model already set
- `gitAdd` silently skips non-git projects and gitignored files

## Inference Engine (src/fix.js)

The `inferModel()` function maps agent/skill names + descriptions to tiers:
- **Tier 1 (Haiku, low)**: explore, search, scan, grep, find, discover, verify, health, check, status, monitor
- **Tier 2 (Sonnet, high)**: review, lint, debug, investigate, diagnose
- **Tier 2 (Sonnet, medium)**: test, format, deploy, build, generate, refactor, pipeline
- **Tier 3 (Opus, high)**: architect, security, audit, migrate, migration
- **Default**: Sonnet, medium

Priority: Haiku checked first, then Opus, then Sonnet-high, then Sonnet-medium, then default.

## Do NOT

- Add runtime dependencies — the zero-dependency constraint is a core selling point
- Use `rm` or `unlinkSync` on user files outside the known template path
- Modify user's CLAUDE.md content beyond the single reference line
- Change the frontmatter injection to overwrite existing `model:` values
- Use CommonJS (`require`) anywhere
- Add a build/transpilation step — source ships as-is
- Skip the full test suite before committing
- Publish without testing on all three Node versions (18, 20, 22)
