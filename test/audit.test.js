import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init } from "../src/init.js";
import { audit } from "../src/audit.js";

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

  it("reports agents with model but no effort", () => {
    init(tmp);
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "scanner.md"),
      "---\nmodel: haiku\n---\nScan files."
    );
    // Should not throw, should report ~
    audit(tmp);
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
