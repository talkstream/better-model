import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findDocsDir, findClaudeMd, getInstallStatus } from "../src/detect.js";

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
