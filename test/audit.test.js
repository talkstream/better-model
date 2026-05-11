import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init } from "../src/init.js";
import { audit } from "../src/audit.js";

/**
 * Run audit() with console.log captured into an array. Zero-dep, no spy lib.
 * @param {string} projectRoot
 * @param {{ fix?: boolean }} [options]
 * @returns {string[]} array of logged lines
 */
function captureAudit(projectRoot, options) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    audit(projectRoot, options);
  } finally {
    console.log = orig;
  }
  return logs;
}

describe("audit", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("reports not installed when better-model is missing", () => {
    // Should not throw
    audit(tmp);
  });

  it("reports agents with model set", () => {
    init(tmp);
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "reviewer.md"),
      "---\nmodel: sonnet\neffort: high\n---\nReview code."
    );
    // Should not throw, should report ✓
    audit(tmp);
  });

  it("reports agents without model set", () => {
    init(tmp);
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "helper.md"),
      "---\ndescription: General helper\n---\nHelp with tasks."
    );
    // Should not throw, should report ✗
    audit(tmp);
  });

  it("treats haiku without effort as the correct state (✓, no issue)", () => {
    init(tmp);
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "scanner.md"),
      "---\nmodel: haiku\n---\nScan files."
    );

    const logs = captureAudit(tmp);

    // The haiku-no-effort line must be a ✓, not a ~ missing warning.
    const scannerLine = logs.find((l) => l.includes("scanner"));
    assert.ok(scannerLine, "scanner line must be present in audit output");
    assert.ok(scannerLine.includes("✓"), `expected ✓ for haiku no-effort, got: ${scannerLine}`);
    assert.ok(
      !scannerLine.includes("missing"),
      "haiku no-effort must NOT be reported as 'missing'"
    );

    // The summary line must not warn about scanner — it must report "All agents have model configuration"
    // because all installed agents (sonnet-coder, haiku-explorer, scanner) are in correct shape.
    const summary = logs.find((l) => l.startsWith("✓") || l.startsWith("⚠"));
    assert.ok(summary && summary.startsWith("✓"), `expected clean summary, got: ${summary}`);
  });

  it("warns when haiku agent has effort field (⚠, increments issues)", () => {
    init(tmp);
    // Inject a stale Haiku agent that still carries effort: low from v0.6-era install.
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "legacy-scanner.md"),
      "---\nmodel: haiku\neffort: low\n---\nScan files."
    );

    const logs = captureAudit(tmp);

    const legacyLine = logs.find((l) => l.includes("legacy-scanner"));
    assert.ok(legacyLine, "legacy-scanner line must be present");
    assert.ok(legacyLine.includes("⚠"), `expected ⚠ warning, got: ${legacyLine}`);
    assert.ok(
      legacyLine.toLowerCase().includes("ignored") || legacyLine.toLowerCase().includes("does not support"),
      `warning must explain why, got: ${legacyLine}`
    );

    // Summary must report at least one issue (this one).
    const summary = logs.find((l) => l.startsWith("⚠"));
    assert.ok(summary, "summary must warn about issues");
  });

  it("audit --fix never auto-strips effort from a stale haiku agent (preserves invariant)", () => {
    init(tmp);
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "legacy-scanner.md"),
      "---\nmodel: haiku\neffort: low\n---\nScan files."
    );

    captureAudit(tmp, { fix: true });

    // After audit --fix, the legacy file must still contain effort: low —
    // CLAUDE.md invariant "fix skips agents that already have model: set —
    // never overwrites user choices". User must remove manually.
    const content = readFileSync(
      join(tmp, ".claude", "agents", "legacy-scanner.md"),
      "utf8"
    );
    assert.ok(content.includes("model: haiku"), "model preserved");
    assert.ok(content.includes("effort: low"), "effort preserved — never auto-strip");
  });

  it("handles project with no .claude directory", () => {
    init(tmp);
    // No .claude/agents or .claude/skills
    audit(tmp);
  });

  it("scans skills with SKILL.md", () => {
    init(tmp);
    mkdirSync(join(tmp, ".claude", "skills", "deploy"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "skills", "deploy", "SKILL.md"),
      "---\nmodel: sonnet\n---\nDeploy."
    );
    // Should not throw
    audit(tmp);
  });
});
