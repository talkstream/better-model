import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isGitRepo, gitAdd } from "../src/git.js";

describe("isGitRepo", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns false for non-git directory", () => {
    assert.equal(isGitRepo(tmp), false);
  });

  it("returns true for git directory", () => {
    execFileSync("git", ["init"], { cwd: tmp, stdio: "ignore" });
    assert.equal(isGitRepo(tmp), true);
  });
});

describe("gitAdd", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
    execFileSync("git", ["init"], { cwd: tmp, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: tmp, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: tmp, stdio: "ignore" });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("stages existing file", () => {
    writeFileSync(join(tmp, "test.md"), "# Test");
    const staged = gitAdd(tmp, ["test.md"]);
    assert.deepEqual(staged, ["test.md"]);

    const status = execFileSync("git", ["status", "--porcelain"], { cwd: tmp, encoding: "utf8" });
    assert.ok(status.includes("A  test.md"));
  });

  it("skips non-existent file", () => {
    const staged = gitAdd(tmp, ["does-not-exist.md"]);
    assert.deepEqual(staged, []);
  });

  it("stages multiple files", () => {
    mkdirSync(join(tmp, "docs"));
    writeFileSync(join(tmp, "docs/guide.md"), "# Guide");
    writeFileSync(join(tmp, "CLAUDE.md"), "# Claude");
    const staged = gitAdd(tmp, ["docs/guide.md", "CLAUDE.md"]);
    assert.equal(staged.length, 2);
  });

  it("returns empty for non-git directory", () => {
    const nonGit = mkdtempSync(join(tmpdir(), "bm-test-"));
    writeFileSync(join(nonGit, "file.md"), "content");
    const staged = gitAdd(nonGit, ["file.md"]);
    assert.deepEqual(staged, []);
    rmSync(nonGit, { recursive: true, force: true });
  });
});
