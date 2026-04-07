import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installAgents, removeAgents, AGENT_MARKER, AGENTS } from "../src/agents.js";

describe("installAgents", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates agents in empty project", () => {
    const result = installAgents(tmp);
    assert.equal(result.installed.length, 2);
    assert.equal(result.skipped.length, 0);
    assert.ok(existsSync(join(tmp, ".claude", "agents", "sonnet-coder.md")));
    assert.ok(existsSync(join(tmp, ".claude", "agents", "haiku-explorer.md")));
  });

  it("creates .claude/agents/ directory when missing", () => {
    assert.ok(!existsSync(join(tmp, ".claude", "agents")));
    installAgents(tmp);
    assert.ok(existsSync(join(tmp, ".claude", "agents")));
  });

  it("skips agent when filename exists", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(join(tmp, ".claude", "agents", "sonnet-coder.md"), "# Custom");

    const result = installAgents(tmp);
    assert.equal(result.installed.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.ok(result.skipped.includes("sonnet-coder.md"));

    // User content preserved
    const content = readFileSync(join(tmp, ".claude", "agents", "sonnet-coder.md"), "utf8");
    assert.equal(content, "# Custom");
  });

  it("skips agent when name field conflicts in different file", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "my-coder.md"),
      "---\nname: sonnet-coder\ndescription: My coder\n---\nContent."
    );

    const result = installAgents(tmp);
    assert.ok(result.skipped.includes("sonnet-coder.md"));
  });

  it("agent files have correct model and effort frontmatter", () => {
    installAgents(tmp);

    const sonnet = readFileSync(join(tmp, ".claude", "agents", "sonnet-coder.md"), "utf8");
    assert.ok(sonnet.includes("model: sonnet"));
    assert.ok(sonnet.includes("effort: medium"));

    const haiku = readFileSync(join(tmp, ".claude", "agents", "haiku-explorer.md"), "utf8");
    assert.ok(haiku.includes("model: haiku"));
    assert.ok(haiku.includes("effort: low"));
  });

  it("agent files contain marker", () => {
    installAgents(tmp);

    for (const agent of AGENTS) {
      const content = readFileSync(join(tmp, ".claude", "agents", agent.filename), "utf8");
      assert.ok(content.includes(AGENT_MARKER));
    }
  });

  it("double install is idempotent", () => {
    installAgents(tmp);
    const result = installAgents(tmp);
    assert.equal(result.installed.length, 0);
    assert.equal(result.skipped.length, 2);
  });
});

describe("removeAgents", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("removes only marked agents", () => {
    installAgents(tmp);
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(join(tmp, ".claude", "agents", "user-agent.md"), "# User agent");

    const result = removeAgents(tmp);
    assert.equal(result.removed.length, 2);
    assert.equal(result.kept.length, 1);
    assert.ok(!existsSync(join(tmp, ".claude", "agents", "sonnet-coder.md")));
    assert.ok(!existsSync(join(tmp, ".claude", "agents", "haiku-explorer.md")));
    assert.ok(existsSync(join(tmp, ".claude", "agents", "user-agent.md")));
  });

  it("preserves unmarked user agents", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(join(tmp, ".claude", "agents", "my-agent.md"), "---\nmodel: opus\n---\nCustom.");

    const result = removeAgents(tmp);
    assert.equal(result.removed.length, 0);
    assert.equal(result.kept.length, 1);
    assert.ok(existsSync(join(tmp, ".claude", "agents", "my-agent.md")));
  });

  it("removes empty .claude/agents/ directory", () => {
    installAgents(tmp);
    removeAgents(tmp);
    assert.ok(!existsSync(join(tmp, ".claude", "agents")));
  });
});
