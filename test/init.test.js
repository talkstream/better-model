import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  init,
  isStaleRoutingBlock,
  ROUTING_BLOCK,
  BLOCK_START,
  BLOCK_END,
  buildRoutingBlock,
  readProfileFromBlock,
  readProjectProfile,
  parseInitArgs,
} from "../src/init.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateSrc = join(__dirname, "..", "templates", "BETTER-MODEL.md");

// A representative v0.5.1 routing block — the one shipped in 0.5.0 and 0.5.1.
// Used to verify the v0.5 → current upgrade path.
const V5_ROUTING_BLOCK = `<!-- better-model:start -->
## Model Routing (better-model)

**CRITICAL**: When spawning subagents via the Agent tool, ALWAYS set the \`model\` and \`effort\` parameters:
- \`model: "haiku", effort: "low"\` — search, grep, file reading, exploration, status checks
- \`model: "sonnet", effort: "medium"\` — code generation, tests, refactoring, bug fixes (1-2 files)
- \`model: "opus", effort: "high"\` — multi-file refactoring (3+ files), architecture, security audits
- \`model: "opus", effort: "max"\` — **code review**

Default to \`model: "sonnet", effort: "medium"\` when unsure.
See [full decision matrix](docs/BETTER-MODEL.md).
<!-- better-model:end -->`;

// A representative v0.6 routing block — shipped in 0.6.0–0.6.2. Carries the
// v0.6 BLOCK_VERSION_MARKER and the (now-incorrect) `effort: "low"` for Haiku.
// Used to verify the v0.6 → current upgrade path (Haiku effort removal).
const V6_ROUTING_BLOCK = `<!-- better-model:start -->
<!-- better-model block version: 0.6 -->
## Model Routing (better-model)

**CRITICAL**: When spawning subagents via the Agent tool, ALWAYS set the \`model\` and \`effort\` parameters:
- \`model: "haiku", effort: "low"\` — search, grep, file reading, exploration, status checks
- \`model: "sonnet", effort: "medium"\` — code generation, tests, refactoring, bug fixes (1-2 files)
- \`model: "opus", effort: "xhigh"\` — multi-file refactoring (3+ files), code review, migrations, cross-file debugging
- \`model: "opus", effort: "max"\` — architecture design, security audits, novel algorithm design

Default to \`model: "sonnet", effort: "medium"\` when unsure.
Avoid Opus on >500K context — known lost-in-the-middle regression.
See [full decision matrix](docs/BETTER-MODEL.md).
<!-- better-model:end -->`;

const V4_REFERENCE_LINE = '→ **[Model Selection Guide](docs/BETTER-MODEL.md)** — when to use Opus/Sonnet/Haiku and effort levels';

describe("isStaleRoutingBlock", () => {
  it("returns true for v0.5.x block (opus/high, no xhigh)", () => {
    const content = `# Project\n\n${V5_ROUTING_BLOCK}\n`;
    assert.equal(isStaleRoutingBlock(content), true);
  });

  it("returns true for v0.6 block (haiku effort: low, no v0.7 marker)", () => {
    const content = `# Project\n\n${V6_ROUTING_BLOCK}\n`;
    assert.equal(isStaleRoutingBlock(content), true);
  });

  it("returns false for current routing block (carries current version marker)", () => {
    const content = `# Project\n\n${ROUTING_BLOCK}\n`;
    assert.equal(isStaleRoutingBlock(content), false);
  });

  it("returns false when no routing block markers are present", () => {
    const content = "# Project\n\nNo block here.\n";
    assert.equal(isStaleRoutingBlock(content), false);
  });

  it("returns false for malformed block (end marker precedes start)", () => {
    const content = `${BLOCK_END}\n...\n${BLOCK_START}\n`;
    assert.equal(isStaleRoutingBlock(content), false);
  });

  it("returns false when only start marker is present", () => {
    const content = `# Project\n\n${BLOCK_START}\npartial content\n`;
    assert.equal(isStaleRoutingBlock(content), false);
  });

  it("returns false when only end marker is present", () => {
    const content = `# Project\n\n${BLOCK_END}\n`;
    assert.equal(isStaleRoutingBlock(content), false);
  });
});

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

  it("adds current routing block with CRITICAL directive, xhigh, max, and Haiku without effort", () => {
    init(tmp);
    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes("<!-- better-model:start -->"));
    assert.ok(content.includes("<!-- better-model:end -->"));
    assert.ok(content.includes("CRITICAL"));
    assert.ok(content.includes('effort: "xhigh"'), "current block must include xhigh");
    assert.ok(content.includes('effort: "max"'), "current block must include max");
    assert.ok(content.includes("lost-in-the-middle"), "current block must include long-context warning");
    // Haiku line must NOT include effort — Haiku 4.5 does not support the effort parameter.
    assert.ok(
      !content.match(/model: "haiku",\s*effort:/),
      "current block must NOT pair model: haiku with an effort field (Haiku 4.5 does not support effort)"
    );
  });

  it("upgrades v0.4.0 reference to v0.6 routing block on re-init", () => {
    // Simulate v0.4.0 install: template + old single-line reference
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\nSome rules.\n\n${V4_REFERENCE_LINE}\n`);

    init(tmp);

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes("<!-- better-model:start -->"), "should have routing block");
    assert.ok(content.includes('effort: "xhigh"'), "should be v0.6 block (xhigh)");
    assert.ok(!content.includes(V4_REFERENCE_LINE), "should not have old reference line");
    assert.ok(content.includes("Some rules."), "should preserve other content");
  });

  it("does not duplicate routing block on double init of v0.4.0 project", () => {
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${V4_REFERENCE_LINE}\n`);

    init(tmp); // first: upgrades
    init(tmp); // second: should be idempotent

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    const blocks = content.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "should have exactly one routing block");
  });

  it("upgrades v0.5.x routing block to current on init (installed branch)", () => {
    // Simulate v0.5.x install: template + old routing block
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(
      join(tmp, "CLAUDE.md"),
      `# Project\n\nUser content above.\n\n${V5_ROUTING_BLOCK}\n\nUser content below.\n`
    );

    init(tmp);

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes('effort: "xhigh"'), "block should be upgraded to current (xhigh present)");
    assert.ok(!content.includes('effort: "high"'), "v0.5 opus/high routing should be gone");
    assert.ok(!content.includes("**code review**"), "v0.5 code-review phrasing should be gone");
    assert.ok(content.includes("User content above."), "content before block preserved");
    assert.ok(content.includes("User content below."), "content after block preserved");
    const blocks = content.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block after upgrade");
  });

  it("upgrades v0.6.x routing block to current on init (installed branch)", () => {
    // v0.6.x ships effort: "low" for Haiku (now known to be unsupported by Haiku 4.5
    // per Anthropic effort docs). The upgrade must strip that field.
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(
      join(tmp, "CLAUDE.md"),
      `# Project\n\nUser content above.\n\n${V6_ROUTING_BLOCK}\n\nUser content below.\n`
    );

    init(tmp);

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    // Haiku effort: "low" from v0.6 must be gone after upgrade to current.
    assert.ok(
      !content.match(/model: "haiku",\s*effort:\s*"low"/),
      "v0.6 haiku-with-effort line should be removed"
    );
    // xhigh / max must still be present (Opus tier mappings unchanged).
    assert.ok(content.includes('effort: "xhigh"'), "Opus xhigh still mapped");
    assert.ok(content.includes('effort: "max"'), "Opus max still mapped");
    // User content surrounding the block must be untouched.
    assert.ok(content.includes("User content above."), "content before block preserved");
    assert.ok(content.includes("User content below."), "content after block preserved");
    const blocks = content.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block after upgrade");
  });

  it("v0.5 → current upgrade is idempotent on repeated init", () => {
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${V5_ROUTING_BLOCK}\n`);

    init(tmp); // first: upgrades v0.5 → current
    const afterFirst = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    init(tmp); // second: should be a no-op on the CLAUDE.md routing block
    const afterSecond = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    assert.equal(afterFirst, afterSecond, "CLAUDE.md unchanged on second init");
    const blocks = afterSecond.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block");
  });

  it("v0.6 → current upgrade is idempotent on repeated init", () => {
    mkdirSync(join(tmp, "docs"), { recursive: true });
    copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${V6_ROUTING_BLOCK}\n`);

    init(tmp); // first: upgrades v0.6 → current
    const afterFirst = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    init(tmp); // second: no-op
    const afterSecond = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    assert.equal(afterFirst, afterSecond, "CLAUDE.md unchanged on second init");
    const blocks = afterSecond.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block");
  });

  it("handles v0.5 upgrade when no docs/ exists (fresh install branch)", () => {
    // v0.5-style routing block but no template file — detect returns installed=false,
    // so init goes through the fresh-install branch. The block must still be upgraded.
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${V5_ROUTING_BLOCK}\n`);

    init(tmp);

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(content.includes('effort: "xhigh"'), "v0.5 block upgraded to current in fresh-install path");
    assert.ok(!content.includes('effort: "high"'), "old high effort routing removed");
    const blocks = content.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block");
  });

  it("handles v0.6 upgrade when no docs/ exists (fresh install branch)", () => {
    // v0.6 routing block in CLAUDE.md but no template file — fresh-install branch
    // must also strip the Haiku effort: low.
    writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${V6_ROUTING_BLOCK}\n`);

    init(tmp);

    const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(
      !content.match(/model: "haiku",\s*effort:/),
      "v0.6 haiku-with-effort removed in fresh-install path"
    );
    const blocks = content.match(/<!-- better-model:start -->/g);
    assert.equal(blocks.length, 1, "exactly one routing block");
  });
});

describe("init — profile support (v0.10)", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-init-profile-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("buildRoutingBlock", () => {
    it("with null/undefined returns block WITHOUT profile marker", () => {
      const a = buildRoutingBlock(null);
      const b = buildRoutingBlock();
      assert.equal(a, b);
      assert.ok(!a.includes("better-model profile:"), "no profile marker");
      assert.ok(a.includes("better-model block version: 0.10"), "current version");
    });

    it("with profile name embeds profile marker", () => {
      const block = buildRoutingBlock("blockchain");
      assert.ok(block.includes("<!-- better-model profile: blockchain -->"), "profile marker present");
      assert.ok(block.includes("better-model block version: 0.10"), "version still present");
    });
  });

  describe("readProfileFromBlock", () => {
    it("returns null for content without any block markers", () => {
      assert.equal(readProfileFromBlock("# random doc\n\nno markers here"), null);
    });

    it("returns null for block without a profile marker", () => {
      const content = `prefix\n${ROUTING_BLOCK}\nsuffix`;
      assert.equal(readProfileFromBlock(content), null);
    });

    it("returns profile name when marker is inside the block", () => {
      const content = `prefix\n${buildRoutingBlock("blockchain")}\nsuffix`;
      assert.equal(readProfileFromBlock(content), "blockchain");
    });

    it("ignores profile-marker-shaped strings OUTSIDE the block markers", () => {
      // Pathological: a stray marker pasted into user prose before the actual
      // block. readProfileFromBlock scans only inside markers.
      const content = `<!-- better-model profile: malicious -->\n${ROUTING_BLOCK}`;
      assert.equal(readProfileFromBlock(content), null);
    });

    it("returns null on non-string input (defensive)", () => {
      assert.equal(readProfileFromBlock(null), null);
      assert.equal(readProfileFromBlock(undefined), null);
      assert.equal(readProfileFromBlock(42), null);
    });
  });

  describe("readProjectProfile", () => {
    it("returns null when CLAUDE.md missing", () => {
      assert.equal(readProjectProfile(tmp), null);
    });

    it("returns null when CLAUDE.md exists but no routing block", () => {
      writeFileSync(join(tmp, "CLAUDE.md"), "# Some other CLAUDE.md content\n");
      assert.equal(readProjectProfile(tmp), null);
    });

    it("returns profile name from a project's installed routing block", () => {
      writeFileSync(join(tmp, "CLAUDE.md"), `# Project\n\n${buildRoutingBlock("blockchain")}\n`);
      assert.equal(readProjectProfile(tmp), "blockchain");
    });
  });

  describe("parseInitArgs", () => {
    it("parses --soft alone", () => {
      const r = parseInitArgs(["--soft"]);
      assert.deepEqual(r, { ok: true, opts: { soft: true } });
    });

    it("parses --profile space form", () => {
      const r = parseInitArgs(["--profile", "blockchain"]);
      assert.deepEqual(r, { ok: true, opts: { soft: false, profile: "blockchain" } });
    });

    it("parses --profile=value form", () => {
      const r = parseInitArgs(["--profile=blockchain"]);
      assert.deepEqual(r, { ok: true, opts: { soft: false, profile: "blockchain" } });
    });

    it("parses --soft and --profile together (order independent)", () => {
      const a = parseInitArgs(["--soft", "--profile", "blockchain"]);
      const b = parseInitArgs(["--profile", "blockchain", "--soft"]);
      assert.equal(a.opts.profile, "blockchain");
      assert.equal(a.opts.soft, true);
      assert.equal(b.opts.profile, "blockchain");
      assert.equal(b.opts.soft, true);
    });

    it("rejects --profile with missing value", () => {
      const r = parseInitArgs(["--profile"]);
      assert.equal(r.ok, false);
      assert.match(r.error, /Missing value/);
    });

    it("rejects --profile followed by another flag (not a value)", () => {
      const r = parseInitArgs(["--profile", "--soft"]);
      assert.equal(r.ok, false);
      assert.match(r.error, /Missing value/);
    });

    it("rejects --profile= empty value", () => {
      const r = parseInitArgs(["--profile="]);
      assert.equal(r.ok, false);
      assert.match(r.error, /Missing value/);
    });

    it("rejects invalid profile slug (uppercase / special chars)", () => {
      for (const bad of ["Blockchain", "block_chain", "block chain", "-blockchain", "1block"]) {
        const r = parseInitArgs(["--profile", bad]);
        assert.equal(r.ok, false, `expected reject for "${bad}"`);
        assert.match(r.error, /Invalid `--profile`/);
      }
    });

    it("rejects unknown flag with helpful error", () => {
      const r = parseInitArgs(["--unknown"]);
      assert.equal(r.ok, false);
      assert.match(r.error, /Unknown flag/);
    });

    it("rejects duplicate --profile flag (last-wins is a footgun, not a feature)", () => {
      for (const args of [
        ["--profile", "blockchain", "--profile", "ton"],
        ["--profile=blockchain", "--profile=ton"],
        ["--profile", "blockchain", "--profile=ton"],
      ]) {
        const r = parseInitArgs(args);
        assert.equal(r.ok, false, `expected rejection for ${args.join(" ")}`);
        assert.match(r.error, /Duplicate `--profile`/);
      }
    });
  });

  describe("init() with profile option", () => {
    function setupProject(extraSetup) {
      // Minimal project skeleton: empty CLAUDE.md + .claude dir + a templates/BETTER-MODEL.md
      // Mirror the existing test pattern.
      writeFileSync(join(tmp, "CLAUDE.md"), "# Project\n");
      mkdirSync(join(tmp, "docs"), { recursive: true });
      copyFileSync(templateSrc, join(tmp, "docs", "BETTER-MODEL.md"));
      if (extraSetup) extraSetup(tmp);
    }

    it("fresh install with profile=blockchain encodes profile marker", () => {
      setupProject();
      init(tmp, { profile: "blockchain" });
      const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
      assert.ok(content.includes("<!-- better-model profile: blockchain -->"));
      assert.ok(content.includes("better-model block version: 0.10"));
    });

    it("fresh install without profile has no profile marker", () => {
      setupProject();
      init(tmp);
      const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
      assert.ok(!content.includes("better-model profile:"));
    });

    it("re-init with no --profile preserves existing profile marker", () => {
      setupProject();
      init(tmp, { profile: "blockchain" });
      init(tmp); // re-run without --profile
      const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
      assert.ok(
        content.includes("<!-- better-model profile: blockchain -->"),
        "existing profile should be preserved on re-init"
      );
    });

    it("re-init with explicit --profile updates the marker", () => {
      setupProject();
      init(tmp, { profile: "blockchain" });
      // Re-run with a different profile to verify override behavior.
      init(tmp, { profile: "ton" });
      const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
      assert.ok(content.includes("<!-- better-model profile: ton -->"));
      assert.ok(!content.includes("<!-- better-model profile: blockchain -->"));
    });

    it("init on v0.7-style block upgrades to v0.10 with no profile", () => {
      // Simulate v0.7 install: block with v0.7 marker (now stale).
      const v07Block = `<!-- better-model:start -->
<!-- better-model block version: 0.7 -->
## Model Routing (better-model)
...
<!-- better-model:end -->`;
      setupProject((root) => {
        writeFileSync(join(root, "CLAUDE.md"), `# Project\n\n${v07Block}\n`);
      });
      init(tmp);
      const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
      assert.ok(content.includes("better-model block version: 0.10"));
      assert.ok(!content.includes("better-model profile:"));
      assert.ok(!content.includes("block version: 0.7"));
    });

    it("init on v0.7-style block with --profile sets profile during upgrade", () => {
      const v07Block = `<!-- better-model:start -->
<!-- better-model block version: 0.7 -->
## Model Routing (better-model)
...
<!-- better-model:end -->`;
      setupProject((root) => {
        writeFileSync(join(root, "CLAUDE.md"), `# Project\n\n${v07Block}\n`);
      });
      init(tmp, { profile: "blockchain" });
      const content = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
      assert.ok(content.includes("better-model block version: 0.10"));
      assert.ok(content.includes("<!-- better-model profile: blockchain -->"));
    });

    it("rejects invalid profile string with no file modification", () => {
      setupProject();
      const before = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
      init(tmp, { profile: "Bad Profile!" });
      const after = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
      // Bad profile → init early-returns; CLAUDE.md untouched.
      assert.equal(after, before);
    });
  });
});
