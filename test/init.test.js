import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init } from "../src/init.js";

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

  it("adds routing block with CRITICAL directive to CLAUDE.md", () => {
    init(tmp);
    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes("<!-- better-model:start -->"));
    assert.ok(content.includes("<!-- better-model:end -->"));
    assert.ok(content.includes("CRITICAL"));
  });
});
