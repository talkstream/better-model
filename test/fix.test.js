import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inferModel, injectFrontmatterField, fix } from "../src/fix.js";

describe("inferModel", () => {
  describe("Haiku tier (Tier 1, no effort field)", () => {
    // Haiku 4.5 does not support the effort parameter per Anthropic effort docs
    // (https://platform.claude.com/docs/en/build-with-claude/effort) — inferModel
    // must omit effort entirely for Haiku results.
    it("matches search keyword", () => {
      const r = inferModel("code-explorer", "Search codebase");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, undefined, "Haiku 4.5 does not support effort");
    });

    it("matches verify keyword", () => {
      const r = inferModel("health-checker", "Verify deployment");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, undefined, "Haiku 4.5 does not support effort");
    });

    it("matches scan keyword", () => {
      const r = inferModel("scanner", "Scan for patterns");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, undefined, "Haiku 4.5 does not support effort");
    });

    it("matches status keyword", () => {
      const r = inferModel("status-probe", "Report status of services");
      assert.equal(r.model, "haiku");
      assert.equal(r.effort, undefined, "Haiku 4.5 does not support effort");
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

    it("matches ultraplan keyword → max (Anthropic cloud planning feature)", () => {
      const r = inferModel("ultraplan-runner", "Run ultraplan in cloud");
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

    it("matches migrator keyword → xhigh (covers 'foo-migrator' agent naming)", () => {
      const r = inferModel("schema-migrator", "Run schema migrator over the codebase");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
    });

    it("matches orchestrate keyword → xhigh (multi-agent orchestration pattern)", () => {
      const r = inferModel("workflow-driver", "Orchestrate a multi-agent pipeline");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
    });

    it("matches orchestrator via substring → xhigh", () => {
      // "orchestrate" subsumes "orchestrator" via substring; explicit test ensures
      // common agent naming like 'multi-agent-orchestrator' is covered.
      const r = inferModel("multi-agent-orchestrator", "Coordinate sub-agents");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
    });

    it("matches advisor keyword → xhigh (Code-with-Claude-2026 'Advisor strategy')", () => {
      const r = inferModel("code-advisor", "Consult frontier model for guidance");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
    });

    it("matches ultrareview via substring → xhigh", () => {
      // "review" subsumes "ultrareview" via substring; verify ultrareview-runner naming works.
      const r = inferModel("ultrareview-runner", "Run ultrareview in CI");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
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
      assert.equal(r.effort, undefined, "Haiku 4.5 does not support effort");
    });

    it("Opus max wins over Opus xhigh when both keywords present", () => {
      // "security" (max) + "review" (xhigh) — security matches first
      const r = inferModel("sec-reviewer", "Security review");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "max", "max tier takes precedence over xhigh");
    });

    it("ultraplan (max) wins over orchestrate (xhigh) when both keywords present", () => {
      const r = inferModel("ultraplan-orchestrator", "Plan and orchestrate at architectural level");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "max", "ultraplan (max-tier) outranks orchestrate (xhigh-tier)");
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
      assert.equal(r.effort, undefined, "Haiku 4.5 does not support effort");
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

  describe("blockchain profile overlay", () => {
    it("does NOT activate blockchain keywords without profile arg", () => {
      // Without profile, "solidity-coder" falls back to default Sonnet medium.
      const r = inferModel("solidity-coder", "Write a Solidity contract");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "medium");
    });

    it("routes Solidity-vocabulary agents to Opus xhigh when profile=blockchain", () => {
      for (const name of ["solidity-coder", "evm-coder", "slither-runner", "mythril-runner"]) {
        const r = inferModel(name, "", "blockchain");
        assert.equal(r.model, "opus", `${name}: expected opus`);
        assert.equal(r.effort, "xhigh", `${name}: expected xhigh`);
        assert.match(r.reason, /blockchain profile/, `${name}: reason mentions profile`);
      }
    });

    it("routes TON-vocabulary agents to Opus xhigh when profile=blockchain", () => {
      for (const name of ["toncoin-bridge", "jetton-wrapper", "tlb-schema-coder"]) {
        const r = inferModel(name, "", "blockchain");
        assert.equal(r.model, "opus", `${name}: expected opus`);
        assert.equal(r.effort, "xhigh", `${name}: expected xhigh`);
        assert.match(r.reason, /blockchain profile/);
      }
    });

    it("Tier 1 Haiku wins over blockchain profile (search verbs still route to Haiku)", () => {
      // "explore-solidity-contracts" → "explore" matches Tier 1 first.
      const r = inferModel("explore-solidity-contracts", "", "blockchain");
      assert.equal(r.model, "haiku");
      assert.match(r.reason, /Tier 1/);
    });

    it("Tier 3 max wins over blockchain profile (architecture still routes to max)", () => {
      const r = inferModel("solidity-architect", "Design contract system", "blockchain");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "max");
      assert.match(r.reason, /max|frontier/);
    });

    it("Tier 3 xhigh base wins over blockchain profile (audit/review still attribute to base)", () => {
      // "solidity-auditor" matches base "audit" before profile "solidity".
      const r = inferModel("solidity-auditor", "Audit a Solidity contract", "blockchain");
      assert.equal(r.model, "opus");
      assert.equal(r.effort, "xhigh");
      // Reason should mention "audit" (base), not blockchain profile.
      assert.match(r.reason, /audit/);
      assert.doesNotMatch(r.reason, /blockchain profile/);
    });

    it("word boundary: 'func' matches FunC vocabulary but NOT 'function'", () => {
      // Positive: FunC contract → matches.
      const positive = inferModel("func-contract-coder", "", "blockchain");
      assert.equal(positive.model, "opus");
      assert.match(positive.reason, /blockchain profile/);

      // Negative: "function-coder" should fall through (no blockchain match).
      const negative = inferModel("function-coder", "Generate a function", "blockchain");
      assert.equal(negative.model, "sonnet");
      assert.match(negative.reason, /generate|safe default/);
    });

    it("word boundary: 'tact' matches Tact vocabulary but NOT 'tactic'/'contact'/'tactical'", () => {
      const positive = inferModel("tact-coder", "Write a Tact contract", "blockchain");
      assert.equal(positive.model, "opus");

      for (const fp of ["tactical-planner", "contact-form-coder", "tactic-analyzer"]) {
        const r = inferModel(fp, "", "blockchain");
        assert.equal(r.model, "sonnet", `${fp}: should NOT match blockchain (false positive)`);
      }
    });

    it("word boundary: 'fift' matches Fift vocabulary but NOT 'fifth'/'fifty'", () => {
      const positive = inferModel("fift-coder", "Write Fift code", "blockchain");
      assert.equal(positive.model, "opus");

      for (const fp of ["fifth-element-coder", "fifty-coder"]) {
        const r = inferModel(fp, "", "blockchain");
        assert.equal(r.model, "sonnet", `${fp}: should NOT match blockchain (false positive)`);
      }
    });

    it("word boundary: 'contract' matches blockchain vocabulary but NOT 'contractual'/'subcontract'", () => {
      const positive = inferModel("contract-coder", "Write a contract", "blockchain");
      assert.equal(positive.model, "opus");

      for (const fp of ["contractual-analyzer", "subcontract-tracker"]) {
        const r = inferModel(fp, "", "blockchain");
        assert.equal(r.model, "sonnet", `${fp}: should NOT match blockchain (false positive)`);
      }
    });

    it("additive invariant: profile NEVER demotes an existing tier", () => {
      // For each baseline (name, description), result-with-profile must be
      // the same model-or-higher than result-without-profile. Tier ordering:
      // haiku < sonnet/medium < sonnet/high < opus/xhigh < opus/max.
      const tierRank = (r) => {
        if (r.model === "haiku") return 1;
        if (r.model === "sonnet" && r.effort === "medium") return 2;
        if (r.model === "sonnet" && r.effort === "high") return 3;
        if (r.model === "opus" && r.effort === "xhigh") return 4;
        if (r.model === "opus" && r.effort === "max") return 5;
        return 0;
      };
      const cases = [
        ["solidity-coder", ""],
        ["function-coder", "Generate a function"],
        ["code-reviewer", "Review changes"],
        ["architect-solidity", "Design contracts"],
        ["explore-contracts", "Search a codebase"],
        ["debug-jetton", "Debug a token contract"],
        ["build-evm", "Build deployment pipeline"],
      ];
      for (const [name, desc] of cases) {
        const base = inferModel(name, desc);
        const profiled = inferModel(name, desc, "blockchain");
        assert.ok(
          tierRank(profiled) >= tierRank(base),
          `additivity violated for ("${name}", "${desc}"): base=${base.model}/${base.effort ?? "-"}, profile=${profiled.model}/${profiled.effort ?? "-"}`
        );
      }
    });

    it("unknown profile value is ignored (falls back to base inference)", () => {
      // Typo / future profile name — must not crash; behaves as no profile.
      const r = inferModel("solidity-coder", "", "ethereum");
      assert.equal(r.model, "sonnet");
      assert.equal(r.effort, "medium");
    });

    it("null and undefined profile values are treated as no profile", () => {
      // Defensive: callers may pass either; both must skip the overlay.
      for (const profile of [null, undefined]) {
        const r = inferModel("solidity-coder", "", profile);
        assert.equal(r.model, "sonnet", `profile=${profile}: expected sonnet`);
        assert.equal(r.effort, "medium", `profile=${profile}: expected medium`);
      }
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

  it("infers haiku without effort for deploy-verifier", () => {
    mkdirSync(join(tmp, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "agents", "deploy-verifier.md"),
      "---\ndescription: Verify deployment health\n---\nCheck."
    );

    const results = fix(tmp);
    assert.equal(results.fixed[0].model, "haiku");
    assert.equal(results.fixed[0].effort, undefined, "Haiku 4.5 does not support effort");

    // Critical regression guard: the file must NOT contain literal "effort: undefined"
    // (the bug fixed by adding the `inferred.effort` check in fix.js guard).
    const content = readFileSync(join(tmp, ".claude", "agents", "deploy-verifier.md"), "utf8");
    assert.ok(content.includes("model: haiku"));
    assert.ok(!content.includes("effort: undefined"), "must not write literal 'effort: undefined'");
    assert.ok(!content.includes("effort: low"), "must not write effort: low — Haiku 4.5 does not support effort");
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
