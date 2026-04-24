import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findDocsDir, findClaudeMd, getInstallStatus, detectPackageManager } from "../src/detect.js";

describe("findDocsDir", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns 'docs' when docs/ exists", () => {
    mkdirSync(join(tmp, "docs"));
    assert.equal(findDocsDir(tmp), "docs");
  });

  it("returns 'doc' when doc/ exists but docs/ does not", () => {
    mkdirSync(join(tmp, "doc"));
    assert.equal(findDocsDir(tmp), "doc");
  });

  it("returns 'documentation' when only documentation/ exists", () => {
    mkdirSync(join(tmp, "documentation"));
    assert.equal(findDocsDir(tmp), "documentation");
  });

  it("prefers 'docs' over 'doc' when both exist", () => {
    mkdirSync(join(tmp, "docs"));
    mkdirSync(join(tmp, "doc"));
    assert.equal(findDocsDir(tmp), "docs");
  });

  it("defaults to 'docs' when no docs directory exists", () => {
    assert.equal(findDocsDir(tmp), "docs");
  });
});

describe("findClaudeMd", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns 'CLAUDE.md' when file exists", () => {
    writeFileSync(join(tmp, "CLAUDE.md"), "# Project");
    assert.equal(findClaudeMd(tmp), "CLAUDE.md");
  });

  it("returns null when CLAUDE.md does not exist", () => {
    assert.equal(findClaudeMd(tmp), null);
  });
});

describe("getInstallStatus", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("reports not installed in empty project", () => {
    const s = getInstallStatus(tmp);
    assert.equal(s.installed, false);
    assert.equal(s.templatePath, null);
    assert.equal(s.claudeMdPath, null);
  });

  it("reports installed when both template and reference exist", () => {
    mkdirSync(join(tmp, "docs"));
    writeFileSync(join(tmp, "docs", "BETTER-MODEL.md"), "# Matrix");
    writeFileSync(join(tmp, "CLAUDE.md"), "See [Guide](docs/BETTER-MODEL.md)");
    const s = getInstallStatus(tmp);
    assert.equal(s.installed, true);
    assert.equal(s.templatePath, "docs/BETTER-MODEL.md");
    assert.equal(s.claudeMdPath, "CLAUDE.md");
  });

  it("reports not installed when template exists but no reference", () => {
    mkdirSync(join(tmp, "docs"));
    writeFileSync(join(tmp, "docs", "BETTER-MODEL.md"), "# Matrix");
    writeFileSync(join(tmp, "CLAUDE.md"), "# Other stuff");
    const s = getInstallStatus(tmp);
    assert.equal(s.installed, false);
    assert.equal(s.templatePath, "docs/BETTER-MODEL.md");
  });

  it("reports not installed when reference exists but no template", () => {
    writeFileSync(join(tmp, "CLAUDE.md"), "See BETTER-MODEL.md");
    const s = getInstallStatus(tmp);
    assert.equal(s.installed, false);
    assert.equal(s.templatePath, null);
  });
});

describe("detectPackageManager", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns null for an empty project", () => {
    assert.equal(detectPackageManager(tmp), null);
  });

  it("returns null for a bare npm project (package.json only, no lockfile, no packageManager)", () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "x" }));
    assert.equal(detectPackageManager(tmp), null);
  });

  it("detects pnpm via pnpm-lock.yaml", () => {
    writeFileSync(join(tmp, "pnpm-lock.yaml"), "lockfileVersion: 9.0\n");
    assert.equal(detectPackageManager(tmp), "pnpm");
  });

  it("detects yarn via yarn.lock", () => {
    writeFileSync(join(tmp, "yarn.lock"), "# yarn lockfile v1\n");
    assert.equal(detectPackageManager(tmp), "yarn");
  });

  it("detects bun via bun.lockb", () => {
    writeFileSync(join(tmp, "bun.lockb"), "");
    assert.equal(detectPackageManager(tmp), "bun");
  });

  it("detects pnpm via packageManager field when no lockfile present", () => {
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "x", packageManager: "pnpm@9.15.0" }),
    );
    assert.equal(detectPackageManager(tmp), "pnpm");
  });

  it("detects yarn via packageManager field", () => {
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "x", packageManager: "yarn@4.1.0" }),
    );
    assert.equal(detectPackageManager(tmp), "yarn");
  });

  it("detects bun via packageManager field", () => {
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "x", packageManager: "bun@1.1.0" }),
    );
    assert.equal(detectPackageManager(tmp), "bun");
  });

  it("prefers lockfile over packageManager (lockfile is stronger evidence)", () => {
    writeFileSync(join(tmp, "pnpm-lock.yaml"), "lockfileVersion: 9.0\n");
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "x", packageManager: "yarn@4.1.0" }),
    );
    assert.equal(detectPackageManager(tmp), "pnpm");
  });

  it("returns null on malformed package.json", () => {
    writeFileSync(join(tmp, "package.json"), "{ not: valid json");
    assert.equal(detectPackageManager(tmp), null);
  });

  it("returns null when packageManager is not a recognized prefix", () => {
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "x", packageManager: "npm@11.7.0" }),
    );
    assert.equal(detectPackageManager(tmp), null);
  });
});
