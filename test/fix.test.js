import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inferModel, injectFrontmatterField, fix } from "../src/fix.js";

describe("inferModel", () => {
  describe("Haiku tier (Tier 1, effort=low)", () => {
    it("matches search keyword", () => {
      const r = inferModel("code-explorer", "Search codebase");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, "low");
    });

    it("matches verify keyword", () => {
      const r = inferModel("health-checker", "Verify deployment");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, "low");
    });

    it("matches scan keyword", () => {
      const r = inferModel("scanner", "Scan for patterns");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, "low");
    });

    it("matches status keyword", () => {
      const r = inferModel("status-probe", "Report status of services");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, "low");
    });
  });

  describe("Opus max tier (Tier 3 frontier reasoning)", () => {
    it("matches architect keyword → max", () => {
      const r = inferModel("architect", "Design system");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "max");
    });

    it("matches security keyword → max", () => {
      const r = inferModel("sec-agent", "Handle security concerns");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "max");
    });

    it("matches novel keyword → max", () => {
      const r = inferModel("solver", "Design novel approach");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "max");
    });

    it("matches algorithm keyword → max", () => {
      const r = inferModel("algo-designer", "Design a complex algorithm");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "max");
    });
  });

  describe("Opus xhigh tier (Tier 3 agentic coding)", () => {
    it("matches audit keyword → xhigh", () => {
      const r = inferModel("code-auditor", "Audit code quality");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
    });

    it("matches migrate keyword → xhigh", () => {
      const r = inferModel("db-migrator", "Migrate database");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
    });

    it("matches migration keyword → xhigh", () => {
      const r = inferModel("db-handler", "Handle database migration");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
    });

    it("review keyword → xhigh (not max, to avoid overthinking on structured output)", () => {
      const r = inferModel("code-reviewer", "Review code changes");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
      assert.notEqual(r.effort, "high", "review must NOT fall back to v0.5 high");
      assert.notEqual(r.effort, "max", "review must NOT use max — Anthropic warns about overthinking");
    });
  });

  describe("Sonnet high tier (Tier 2 with rigor)", () => {
    it("matches debug keyword → high", () => {
      const r = inferModel("debugger", "Debug failing tests");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "high");
    });

    it("matches investigate keyword → high", () => {
      const r = inferModel("bug-investigator", "Investigate the issue");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "high");
    });

    it("matches diagnose keyword → high", () => {
      const r = inferModel("diagnostician", "Diagnose the failure");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "high");
    });

    it("matches lint keyword → high", () => {
      // Avoid "check" substring (Haiku keyword) — use "lint-runner" instead.
      const r = inferModel("lint-runner", "Run lint over the codebase");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "high");
    });
  });

  describe("Sonnet medium tier (Tier 2 standard coding)", () => {
    it("matches test keyword → medium", () => {
      const r = inferModel("test-runner", "Run test suite");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "medium");
    });

    it("matches refactor keyword → medium", () => {
      const r = inferModel("refactorer", "Refactor function");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "medium");
    });

    it("matches generate keyword → medium", () => {
      const r = inferModel("generator", "Generate boilerplate");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "medium");
    });
  });

  describe("default fallback", () => {
    it("defaults to sonnet/medium for unknown keywords", () => {
      const r = inferModel("helper", "General assistant");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "medium");
    });
  });

  describe("priority ordering", () => {
    it("Haiku wins over Opus when both keywords present", () => {
      // "search" (Haiku) + "review" (Opus xhigh) — search matches first by priority
      const r = inferModel("search-reviewer", "Search and review code");
      assert.equal(r.model, "haiku", "Haiku priority highest");
      assert.equal(r.effort, "low");
    });

    it("Opus max wins over Opus xhigh when both keywords present", () => {
      // "security" (max) + "review" (xhigh) — security matches first
      const r = inferModel("sec-reviewer", "Security review");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "max", "max tier takes precedence over xhigh");
    });

    it("Opus xhigh wins over Sonnet high when both keywords present", () => {
      // "review" (Opus xhigh) + "debug" (Sonnet high) — review matches first
      const r = inferModel("debug-reviewer", "Review and debug code");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
    });

    it("Sonnet high wins over Sonnet medium when both keywords present", () => {
      // "debug" (Sonnet high) + "test" (Sonnet medium) — debug matches first
      const r = inferModel("debug-tester", "Debug test suite");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "high");
    });

    it("Haiku wins over Sonnet high when both keywords present", () => {
      // "scan" (Haiku) + "debug" (Sonnet high) — scan matches first by Haiku priority
      const r = inferModel("scan-debugger", "Scan and debug subtle issues");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, "low");
    });
  });

  describe("reason annotation", () => {
    it("includes matching keyword in reason", () => {
      const r = inferModel("code-reviewer", "Review changes");
      assert.match(r.reason, /review/);
      assert.match(r.reason, /xhigh|agentic/);
    });

    it("labels max-tier matches as frontier reasoning", () => {
      const r = inferModel("architect", "Design system");
      assert.match(r.reason, /max|frontier/);
    });
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

  it("handles xhigh effort value", () => {
    const input = "---\nmodel: opus\n---\nBody.";
    const result = injectFrontmatterField(input, "effort", "xhigh");
    assert.ok(result.includes("effort: xhigh"));
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

  it("injects model+effort into agent without them", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "helper.md"),
      "---\ndescription: General helper\n---\nHelp."
    );

    const results = fix(tmp);
    assert.equal(results.fixed.length, 1);
    assert.equal(results.fixed[0].model, "sonnet");
    assert.equal(results.fixed[0].effort, "medium");

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

  it("infers haiku+low for deploy-verifier", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "deploy-verifier.md"),
      "---\ndescription: Verify deployment health\n---\nCheck."
    );

    const results = fix(tmp);
    assert.equal(results.fixed[0].model, "haiku");
    assert.equal(results.fixed[0].effort, "low");
  });

  it("infers opus+xhigh for db-migrator (agentic coding)", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "db-migrator.md"),
      "---\ndescription: Database migration handler\n---\nMigrate."
    );

    const results = fix(tmp);
    assert.equal(results.fixed[0].model, "opus");
    assert.equal(results.fixed[0].effort, "xhigh");

    const content = readFileSync(join(tmp, ".claude", "agents", "db-migrator.md"), "utf8");
    assert.ok(content.includes("model: opus"));
    assert.ok(content.includes("effort: xhigh"));
  });

  it("infers opus+max for architect (frontier reasoning)", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "system-architect.md"),
      "---\ndescription: Design system architecture\n---\nArchitect."
    );

    const results = fix(tmp);
    assert.equal(results.fixed[0].model, "opus");
    assert.equal(results.fixed[0].effort, "max");

    const content = readFileSync(join(tmp, ".claude", "agents", "system-architect.md"), "utf8");
    assert.ok(content.includes("model: opus"));
    assert.ok(content.includes("effort: max"));
  });

  it("infers opus+xhigh for code-reviewer (not max)", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "code-reviewer.md"),
      "---\ndescription: Review code changes\n---\nReview."
    );

    const results = fix(tmp);
    assert.equal(results.fixed[0].model, "opus");
    assert.equal(results.fixed[0].effort, "xhigh",
      "review must route to xhigh — max risks overthinking on structured output");
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
