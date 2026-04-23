import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { init, isStaleRoutingBlock, ROUTING_BLOCK, BLOCK_START, BLOCK_END } from "../src/init.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateSrc = join(__dirname, "..", "templates", "BETTER-MODEL.md");

// A representative v0.5.1 routing block — the one shipped in 0.5.0 and 0.5.1.
// Used to verify the v0.5 → v0.6 upgrade path.
const V5_ROUTING_BLOCK = `<!-- better-model:start -->
## Model Routing (better-model)

**CRITICAL**: When spawning subagents via the Agent tool, ALWAYS set the \`model\` and \`effort\` parameters:
- \`model: "haiku", effort: "low"\` — search, grep, file reading, exploration, status checks
- \`model: "sonnet", effort: "medium"\` — code generation, tests, refactoring, bug fixes (1-2 files)
- \`model: "opus", effort: "high"\` — multi-file refactoring (3+ files), architecture, security audits
- \`model: "opus", effort: "max"\` — **code review**

Default to \`model: "sonnet", effort: "medium"\` when unsure.
See [full decision matrix](docs/BETTER-MODEL.md).
<!-- better-model:end -->`;

const V4_REFERENCE_LINE = '→ **[Model Selection Guide](docs/BETTER-MODEL.md)** — when to use Opus/Sonnet/Haiku and effort levels';

describe("isStaleRoutingBlock", () => {
  it("returns true for v0.5.x block (opus/high, no xhigh)", () => {
    const content = `# Project\n\n${V5_ROUTING_BLOCK}\n`;
    assert.equal(isStaleRoutingBlock(content), true);
  });

  it("returns false for v0.6 block (contains xhigh)", () => {
    const content = `# Project\n\n${ROUTING_BLOCK}\n`;
    assert.equal(isStaleRoutingBlock(content), false);
  });

  it("returns false when no routing block markers are present", () => {
    const content = "# Project\n\nNo block here.\n";
    assert.equal(isStaleRoutingBlock(content), false);
  });

  it("returns false for malformed block (end marker precedes start)", () => {
    const content = `${BLOCK_END}\n...\n${BLOCK_START}\n`;
    assert.equal(isStaleRoutingBlock(content), false);
  });

  it("returns false when only start marker is present", () => {
    const content = `# Project\n\n${BLOCK_START}\npartial content\n`;
    assert.equal(isStaleRoutingBlock(content), false);
  });

  it("returns false when only end marker is present", () => {
    const content = `# Project\n\n${BLOCK_END}\n`;
    assert.equal(isStaleRoutingBlock(content), false);
  });
});

describe("init", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates docs/ and CLAUDE.md in empty project", () => {
    init(tmp);
    assert.ok(existsSync(join(tmp, "docs", "BETTER-MODEL.md")));
    assert.ok(existsSync(join(tmp, "CLAUDE.md")));
    const claude = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(claude.includes("BETTER-MODEL.md"));
  });

  it("uses existing docs directory", () => {
    mkdirSync(join(tmp, "docs"));
    writeFileSync(join(tmp, "docs", "existing.md"), "# Existing");
    init(tmp);
    assert.ok(existsSync(join(tmp, "docs", "BETTER-MODEL.md")));
    assert.ok(existsSync(join(tmp, "docs", "existing.md")));
  });

  it("uses existing doc/ directory instead of creating docs/", () => {
    mkdirSync(join(tmp, "doc"));
    init(tmp);
    assert.ok(existsSync(join(tmp, "doc", "BETTER-MODEL.md")));
    assert.ok(!existsSync(join(tmp, "docs")));
  });

  it("appends reference to existing CLAUDE.md", () => {
    writeFileSync(join(tmp, "CLAUDE.md"), "# My Project\n\nExisting rules.\n");
    init(tmp);
    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.startsWith("# My Project"));
    assert.ok(content.includes("BETTER-MODEL.md"));
    assert.ok(content.includes("Existing rules."));
  });

  it("does not duplicate reference on repeated init", () => {
    init(tmp);
    init(tmp); // second call
    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    const matches = content.match(/BETTER-MODEL\.md/g);
    // Reference line contains one occurrence, template line has the link text
    assert.ok(matches.length <= 2);
  });

  it("copies template with correct content", () => {
    init(tmp);
    const template = readFileSync(join(tmp, "docs", "BETTER-MODEL.md"), "utf8");
    assert.ok(template.includes("Better Model"));
    assert.ok(template.includes("decision matrix"));
    assert.ok(template.includes("Tier 1"));
    assert.ok(template.includes("Tier 2"));
    assert.ok(template.includes("Tier 3"));
    assert.ok(template.includes("Sources & Credits"));
  });

  it("creates agents in enforcement mode", () => {
    init(tmp);
    assert.ok(existsSync(join(tmp, ".claude", "agents", "sonnet-coder.md")));
    assert.ok(existsSync(join(tmp, ".claude", "agents", "haiku-explorer.md")));
  });

  it("skips agents in soft mode", () => {
    init(tmp, { soft: true });
    assert.ok(!existsSync(join(tmp, ".claude", "agents", "sonnet-coder.md")));
    assert.ok(!existsSync(join(tmp, ".claude", "agents", "haiku-explorer.md")));
  });

  it("adds v0.6 routing block with CRITICAL directive, xhigh and max", () => {
    init(tmp);
    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes("<!-- better-model:start -->"));
    assert.ok(content.includes("<!-- better-model:end -->"));
    assert.ok(content.includes("CRITICAL"));
    assert.ok(content.includes('effort: "xhigh"'), "v0.6 block must include xhigh");
    assert.ok(content.includes('effort: "max"'), "v0.6 block must include max");
    assert.ok(content.includes("lost-in-the-middle"), "v0.6 block must include long-context warning");
  });

  it("upgrades v0.4.0 reference to v0.6 routing block on re-init", () => {
    // Simulate v0.4.0 install: template + old single-line reference
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\nSome rules.\n\n${V4_REFERENCE_LINE}\n`);

    init(tmp);

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes("<!-- better-model:start -->"), "should have routing block");
    assert.ok(content.includes('effort: "xhigh"'), "should be v0.6 block (xhigh)");
    assert.ok(!content.includes(V4_REFERENCE_LINE), "should not have old reference line");
    assert.ok(content.includes("Some rules."), "should preserve other content");
  });

  it("does not duplicate routing block on double init of v0.4.0 project", () => {
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${V4_REFERENCE_LINE}\n`);

    init(tmp); // first: upgrades
    init(tmp); // second: should be idempotent

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    const blocks = content.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "should have exactly one routing block");
  });

  it("upgrades v0.5.x routing block to v0.6 on init (installed branch)", () => {
    // Simulate v0.5.x install: template + old routing block
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(
      join(tmp, "CLAUDE.md"),
      `# Project\n\nUser content above.\n\n${V5_ROUTING_BLOCK}\n\nUser content below.\n`
    );

    init(tmp);

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes('effort: "xhigh"'), "block should be upgraded to v0.6 (xhigh)");
    assert.ok(!content.includes('effort: "high"'), "v0.5 opus/high routing should be gone");
    assert.ok(!content.includes("**code review**"), "v0.5 code-review phrasing should be gone");
    assert.ok(content.includes("User content above."), "content before block preserved");
    assert.ok(content.includes("User content below."), "content after block preserved");
    const blocks = content.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block after upgrade");
  });

  it("v0.5 → v0.6 upgrade is idempotent on repeated init", () => {
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${V5_ROUTING_BLOCK}\n`);

    init(tmp); // first: upgrades v0.5 → v0.6
    const afterFirst = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    init(tmp); // second: should be a no-op on the CLAUDE.md routing block
    const afterSecond = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    assert.equal(afterFirst, afterSecond, "CLAUDE.md unchanged on second init");
    const blocks = afterSecond.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block");
  });

  it("handles v0.5 upgrade when no docs/ exists (fresh install branch)", () => {
    // v0.5-style routing block but no template file — detect returns installed=false,
    // so init goes through the fresh-install branch. The block must still be upgraded.
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${V5_ROUTING_BLOCK}\n`);

    init(tmp);

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes('effort: "xhigh"'), "v0.5 block upgraded to v0.6 in fresh-install path");
    assert.ok(!content.includes('effort: "high"'), "old high effort routing removed");
    const blocks = content.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block");
  });
});
