import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inferModel, injectFrontmatterField, fix } from "../src/fix.js";

describe("inferModel", () => {
  it("returns haiku for search/explore keywords", () => {
    assert.equal(inferModel("code-explorer", "Search codebase").model, "haiku");
    assert.equal(inferModel("health-checker", "Verify deployment").model, "haiku");
    assert.equal(inferModel("scanner", "Scan for patterns").model, "haiku");
  });

  it("returns opus for security/architecture keywords", () => {
    assert.equal(inferModel("security-auditor", "Audit code").model, "opus");
    assert.equal(inferModel("db-migrator", "Handle database migration").model, "opus");
    assert.equal(inferModel("architect", "Design system").model, "opus");
  });

  it("returns sonnet with high effort for review/debug", () => {
    const r = inferModel("code-reviewer", "Review code changes");
    assert.equal(r.model, "sonnet");
    assert.equal(r.effort, "high");
  });

  it("returns sonnet with medium effort for test/deploy", () => {
    const r = inferModel("test-runner", "Run test suite");
    assert.equal(r.model, "sonnet");
    assert.equal(r.effort, "medium");
  });

  it("defaults to sonnet/medium for unknown keywords", () => {
    const r = inferModel("helper", "General assistant");
    assert.equal(r.model, "sonnet");
    assert.equal(r.effort, "medium");
  });
});

describe("injectFrontmatterField", () => {
  it("adds field to existing frontmatter", () => {
    const input = "---\nname: reviewer\n---\nBody.";
    const result = injectFrontmatterField(input, "model", "sonnet");
    assert.ok(result.includes("model: sonnet"));
    assert.ok(result.includes("name: reviewer"));
    assert.ok(result.includes("Body."));
  });

  it("does not duplicate existing field", () => {
    const input = "---\nmodel: opus\n---\nBody.";
    const result = injectFrontmatterField(input, "model", "sonnet");
    assert.ok(!result.includes("model: sonnet"));
    assert.ok(result.includes("model: opus"));
  });

  it("creates frontmatter when none exists", () => {
    const input = "Just a body.";
    const result = injectFrontmatterField(input, "model", "haiku");
    assert.ok(result.startsWith("---\nmodel: haiku\n---\n"));
    assert.ok(result.includes("Just a body."));
  });

  it("handles multiple fields", () => {
    let content = "---\nname: test\n---\nBody.";
    content = injectFrontmatterField(content, "model", "sonnet");
    content = injectFrontmatterField(content, "effort", "high");
    assert.ok(content.includes("model: sonnet"));
    assert.ok(content.includes("effort: high"));
    assert.ok(content.includes("name: test"));
  });
});

describe("fix", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("injects model into agent without one", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "helper.md"),
      "---\ndescription: General helper\n---\nHelp."
    );

    const results = fix(tmp);
    assert.equal(results.fixed.length, 1);
    assert.equal(results.fixed[0].model, "sonnet");

    const content = readFileSync(join(tmp, ".claude", "agents", "helper.md"), "utf8");
    assert.ok(content.includes("model: sonnet"));
    assert.ok(content.includes("effort: medium"));
  });

  it("skips agent that already has model", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "reviewer.md"),
      "---\nmodel: sonnet\n---\nReview."
    );

    const results = fix(tmp);
    assert.equal(results.fixed.length, 0);
    assert.equal(results.skipped.length, 1);
    assert.ok(results.skipped[0].reason.includes("already has model"));
  });

  it("infers haiku for deploy-verifier", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "deploy-verifier.md"),
      "---\ndescription: Verify deployment health\n---\nCheck."
    );

    const results = fix(tmp);
    assert.equal(results.fixed[0].model, "haiku");
  });

  it("infers opus for db-migrator", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "db-migrator.md"),
      "---\ndescription: Database migration handler\n---\nMigrate."
    );

    const results = fix(tmp);
    assert.equal(results.fixed[0].model, "opus");
  });

  it("skips skill that delegates to agent with model", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    mkdirSync(join(tmp, ".claude", "skills", "review"), { recursive: true });

    writeFileSync(
      join(tmp, ".claude", "agents", "reviewer.md"),
      "---\nmodel: sonnet\n---\nReview."
    );
    writeFileSync(
      join(tmp, ".claude", "skills", "review", "SKILL.md"),
      "---\nagent: reviewer\n---\nRun review."
    );

    const results = fix(tmp);
    assert.equal(results.fixed.length, 0);
    const skillSkip = results.skipped.find((s) => s.file.includes("skills"));
    assert.ok(skillSkip);
    assert.ok(skillSkip.reason.includes("delegates to agent"));
  });

  it("dry run does not write files", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "helper.md"),
      "---\ndescription: Help\n---\nHelp."
    );

    const results = fix(tmp, { dryRun: true });
    assert.equal(results.fixed.length, 1);

    const content = readFileSync(join(tmp, ".claude", "agents", "helper.md"), "utf8");
    assert.ok(!content.includes("model:"));
  });

  it("handles project with no .claude directory", () => {
    const results = fix(tmp);
    assert.equal(results.fixed.length, 0);
    assert.equal(results.skipped.length, 0);
  });
});
