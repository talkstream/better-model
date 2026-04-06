import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init } from "../src/init.js";
import { reset } from "../src/reset.js";

describe("reset", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("removes template and CLAUDE.md when CLAUDE.md was created by init", () => {
    init(tmp);
    reset(tmp);
    assert.ok(!existsSync(join(tmp, "docs", "BETTER-MODEL.md")));
    assert.ok(!existsSync(join(tmp, "CLAUDE.md")));
  });

  it("removes only the reference line from existing CLAUDE.md", () => {
    writeFileSync(join(tmp, "CLAUDE.md"), "# My Project\n\nKeep this.\n");
    init(tmp);
    reset(tmp);
    assert.ok(existsSync(join(tmp, "CLAUDE.md")));
    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(!content.includes("BETTER-MODEL.md"));
    assert.ok(content.includes("Keep this."));
  });

  it("removes empty docs/ directory", () => {
    init(tmp);
    reset(tmp);
    assert.ok(!existsSync(join(tmp, "docs")));
  });

  it("preserves docs/ when other files exist", () => {
    mkdirSync(join(tmp, "docs"));
    writeFileSync(join(tmp, "docs", "other.md"), "# Other");
    init(tmp);
    reset(tmp);
    assert.ok(existsSync(join(tmp, "docs")));
    assert.ok(existsSync(join(tmp, "docs", "other.md")));
    assert.ok(!existsSync(join(tmp, "docs", "BETTER-MODEL.md")));
  });

  it("handles reset on non-installed project gracefully", () => {
    // Should not throw
    reset(tmp);
  });

  it("is idempotent — second reset does not throw", () => {
    init(tmp);
    reset(tmp);
    reset(tmp); // second call
  });
});
