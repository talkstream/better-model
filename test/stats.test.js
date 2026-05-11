import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  README_TARGET,
  projectHash,
  listSessionFiles,
  resolveProjectDir,
  normalizeMainModel,
  readJsonl,
  extractSubagentModels,
  extractMainAgentModel,
  aggregateFiles,
  percentages,
  formatText,
  formatJson,
  runStats,
  parseStatsArgs,
} from "../src/stats.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "sample-session.jsonl");

/**
 * Anchor `now` for timestamp filter — deterministic across tests.
 * Fixture L1-L9 fall within the 7-day window ending at this instant.
 */
const NOW = new Date("2026-05-12T12:00:00.000Z");

/**
 * Capture console.log output as string[] while invoking fn.
 * Restores console.log in finally — zero-dep, no spy library.
 * @param {() => Promise<any>|any} fn
 * @returns {Promise<{logs:string[], result:any}>}
 */
async function captureLogs(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    const result = await fn();
    return { logs, result };
  } finally {
    console.log = orig;
  }
}

/**
 * Write a JSONL file at `<homedir>/.claude/projects/<hash>/<sid>.jsonl`.
 * @param {string} homedir
 * @param {string} cwdAbs — used to compute hash
 * @param {string} sessionId
 * @param {object[]} records
 * @returns {string} absolute path written
 */
function writeSession(homedir, cwdAbs, sessionId, records) {
  const hashDir = join(homedir, ".claude", "projects", projectHash(cwdAbs));
  mkdirSync(hashDir, { recursive: true });
  const file = join(hashDir, `${sessionId}.jsonl`);
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return file;
}

/**
 * Build a basic assistant record with one Agent tool_use.
 * @param {{model:string|null, mainModel?:string, ts?:string, sidechain?:boolean, cwd?:string}} opts
 * @returns {object}
 */
function agentRec({ model, mainModel = "claude-opus-4-7", ts = "2026-05-09T10:00:00.000Z", sidechain = false, cwd = "/test/proj" }) {
  const input = { description: "x", subagent_type: "Explore", prompt: "REDACTED" };
  if (model !== null) input.model = model;
  return {
    parentUuid: null,
    isSidechain: sidechain,
    message: { model: mainModel, content: [{ type: "tool_use", id: "toolu_001", name: "Agent", input }] },
    type: "assistant",
    uuid: "00000000-0000-0000-0000-000000000000",
    timestamp: ts,
    cwd,
    sessionId: "11111111-1111-1111-1111-111111111111",
  };
}

describe("stats — pure functions", () => {
  // T1
  it("projectHash maps slashes to dashes", () => {
    assert.equal(projectHash("/foo/bar"), "-foo-bar");
    assert.equal(projectHash("/Users/x/proj"), "-Users-x-proj");
  });

  // T2
  it("projectHash handles root path edge", () => {
    assert.equal(projectHash("/"), "-");
  });

  // T3
  it("normalizeMainModel maps opus IDs", () => {
    assert.equal(normalizeMainModel("claude-opus-4-7"), "opus");
  });

  // T4
  it("normalizeMainModel maps sonnet IDs", () => {
    assert.equal(normalizeMainModel("claude-sonnet-4-6"), "sonnet");
  });

  // T5
  it("normalizeMainModel maps haiku IDs", () => {
    assert.equal(normalizeMainModel("claude-haiku-4-5-20251001"), "haiku");
  });

  // T6
  it("normalizeMainModel returns other for unknown family", () => {
    assert.equal(normalizeMainModel("claude-future-x"), "other");
  });

  // T7
  it("normalizeMainModel returns null for null/undefined/non-string", () => {
    assert.equal(normalizeMainModel(null), null);
    assert.equal(normalizeMainModel(undefined), null);
    assert.equal(normalizeMainModel(42), null);
    assert.equal(normalizeMainModel(""), null);
  });
});

describe("stats — record extraction", () => {
  // T8
  it("counts a single sonnet Agent call", () => {
    const r = agentRec({ model: "sonnet" });
    assert.deepEqual(extractSubagentModels(r), ["sonnet"]);
  });

  // T9
  it("counts multiple tool_use blocks in one message", () => {
    const r = agentRec({ model: "sonnet" });
    r.message.content.push({
      type: "tool_use",
      id: "toolu_002",
      name: "Agent",
      input: { description: "x", subagent_type: "Explore", model: "haiku", prompt: "x" },
    });
    assert.deepEqual(extractSubagentModels(r), ["sonnet", "haiku"]);
  });

  // T10
  it("ignores non-assistant records", () => {
    assert.deepEqual(extractSubagentModels({ type: "user", message: { content: [] } }), []);
    assert.equal(extractMainAgentModel({ type: "user" }), null);
  });

  // T11
  it("skips sidechain records", () => {
    const r = agentRec({ model: "sonnet", sidechain: true });
    assert.deepEqual(extractSubagentModels(r), []);
    assert.equal(extractMainAgentModel(r), null);
  });

  // T12
  it("skips non-Agent tool_use blocks (Read/Edit)", () => {
    const r = {
      type: "assistant",
      isSidechain: false,
      message: {
        model: "claude-sonnet-4-6",
        content: [{ type: "tool_use", id: "x", name: "Read", input: { file_path: "/x" } }],
      },
    };
    assert.deepEqual(extractSubagentModels(r), []);
    assert.equal(extractMainAgentModel(r), "sonnet");
  });

  // T14
  it("buckets missing input.model as unknown", () => {
    const r = agentRec({ model: null });
    assert.deepEqual(extractSubagentModels(r), ["unknown"]);
  });
});

describe("stats — aggregator + percentages", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-stats-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // T13
  it("filters by timestamp window edges", async () => {
    const inside = agentRec({ model: "sonnet", ts: "2026-05-09T10:00:00.000Z" });
    const before = agentRec({ model: "opus", ts: "2026-05-01T00:00:00.000Z" });
    const after = agentRec({ model: "haiku", ts: "2026-05-20T00:00:00.000Z" });
    const file = writeSession(tmp, "/test/p", "sess1", [inside, before, after]);
    const from = new Date("2026-05-05T12:00:00.000Z");
    const to = new Date("2026-05-12T12:00:00.000Z");
    const agg = await aggregateFiles([file], from, to);
    assert.equal(agg.subagentCounts.sonnet, 1);
    assert.equal(agg.subagentCounts.opus, 0);
    assert.equal(agg.subagentCounts.haiku, 0);
  });

  // T15
  it("survives malformed jsonl lines", async () => {
    const file = join(tmp, "session.jsonl");
    const good = JSON.stringify(agentRec({ model: "sonnet" }));
    writeFileSync(file, `${good}\n{this is broken\n${good}\n`);
    const agg = await aggregateFiles([file], new Date("2026-05-05T12:00:00.000Z"), new Date("2026-05-12T12:00:00.000Z"));
    assert.equal(agg.subagentCounts.sonnet, 2);
    assert.equal(agg.linesFailed, 1);
  });

  // T20
  it("aggregates multiple session files in one project", async () => {
    const homedir = tmp;
    const cwd = "/test/multi";
    writeSession(homedir, cwd, "s1", [agentRec({ model: "sonnet" })]);
    writeSession(homedir, cwd, "s2", [agentRec({ model: "opus" })]);
    const dir = resolveProjectDir(cwd, homedir);
    const files = listSessionFiles(dir);
    assert.equal(files.length, 2);
    const agg = await aggregateFiles(files, new Date("2026-05-05T12:00:00.000Z"), NOW);
    assert.equal(agg.subagentCounts.sonnet, 1);
    assert.equal(agg.subagentCounts.opus, 1);
  });

  // T26
  it("percentages excludes unknown bucket from denominator", () => {
    const p = percentages({ sonnet: 1, opus: 1, haiku: 0, unknown: 5 });
    assert.equal(p.sonnet, 0.5);
    assert.equal(p.opus, 0.5);
    assert.equal(p.haiku, 0);
  });

  it("percentages with 0 denom returns all zero", () => {
    const p = percentages({ sonnet: 0, opus: 0, haiku: 0 });
    assert.deepEqual(p, { sonnet: 0, opus: 0, haiku: 0 });
  });
});

describe("stats — runStats integration", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-stats-int-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // T17
  it("handles missing ~/.claude/projects/ dir (exit 0 + friendly)", async () => {
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd: "/x", homedir: tmp, now: NOW })
    );
    assert.equal(result, 0);
    assert.match(logs.join("\n"), /Claude Code logs not found/);
  });

  // T18
  it("handles missing project hash dir (exit 0 + friendly)", async () => {
    mkdirSync(join(tmp, ".claude", "projects", "-some-other-proj"), { recursive: true });
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd: "/test/missing", homedir: tmp, now: NOW })
    );
    assert.equal(result, 0);
    assert.match(logs.join("\n"), /No data for this project yet/);
  });

  // T19
  it("handles empty dir (no jsonl, exit 0 + friendly)", async () => {
    mkdirSync(join(tmp, ".claude", "projects", projectHash("/test/empty")), { recursive: true });
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd: "/test/empty", homedir: tmp, now: NOW })
    );
    assert.equal(result, 0);
    assert.match(logs.join("\n"), /No session data/);
  });

  // T16
  it("exits 1 when all lines are malformed", async () => {
    const cwd = "/test/allbad";
    const hashDir = join(tmp, ".claude", "projects", projectHash(cwd));
    mkdirSync(hashDir, { recursive: true });
    writeFileSync(join(hashDir, "s.jsonl"), "{not json\n[also not json\n");
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd, homedir: tmp, now: NOW })
    );
    assert.equal(result, 1);
    assert.match(logs.join("\n"), /All session files unreadable/);
  });

  // T21
  it("--all-projects aggregates across multiple project dirs", async () => {
    writeSession(tmp, "/test/p1", "s1", [agentRec({ model: "sonnet" })]);
    writeSession(tmp, "/test/p2", "s2", [agentRec({ model: "haiku" })]);
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd: "/test/p1", homedir: tmp, allProjects: true, now: NOW, json: true })
    );
    assert.equal(result, 0);
    const json = JSON.parse(logs.join("\n"));
    assert.equal(json.subagent_dispatch.counts.sonnet, 1);
    assert.equal(json.subagent_dispatch.counts.haiku, 1);
    assert.equal(json.project, "all projects");
  });

  // T22 — privacy regex over BOTH formatText and formatJson
  it("privacy: neither formatText nor formatJson leaks UUIDs/prompts/session IDs", async () => {
    const cwd = "/test/priv";
    writeSession(tmp, cwd, "11111111-1111-1111-1111-111111111111", [
      {
        ...agentRec({ model: "sonnet" }),
        // Simulate realistic leakable content
        message: {
          model: "claude-opus-4-7",
          content: [{
            type: "tool_use",
            id: "toolu_01PRIVATEPRIVATEPRIVATE",
            name: "Agent",
            input: { description: "SECRET_DESC", subagent_type: "Explore", model: "sonnet", prompt: "VERY_SECRET_PROMPT" },
          }],
        },
        uuid: "deadbeef-dead-beef-dead-beefdeadbeef",
        sessionId: "11111111-1111-1111-1111-111111111111",
      },
    ]);
    const { logs: textLogs } = await captureLogs(() =>
      runStats({ cwd, homedir: tmp, now: NOW })
    );
    const { logs: jsonLogs } = await captureLogs(() =>
      runStats({ cwd, homedir: tmp, now: NOW, json: true })
    );
    const combined = textLogs.join("\n") + "\n" + jsonLogs.join("\n");
    assert.doesNotMatch(combined, /VERY_SECRET_PROMPT/);
    assert.doesNotMatch(combined, /SECRET_DESC/);
    assert.doesNotMatch(combined, /toolu_01/);
    assert.doesNotMatch(combined, /deadbeef-dead-beef-dead-beefdeadbeef/);
    // UUID-shape regex — any 8-4-4-4-12 hex sequence (covers sessionId / uuids)
    assert.doesNotMatch(combined, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  // T23 — JSON schema conformance
  it("--json output has stable schema (required keys + types)", async () => {
    const cwd = "/test/schema";
    writeSession(tmp, cwd, "s", [agentRec({ model: "sonnet" })]);
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd, homedir: tmp, now: NOW, json: true })
    );
    assert.equal(result, 0);
    const json = JSON.parse(logs.join("\n"));
    assert.equal(typeof json.project, "string");
    assert.equal(typeof json.window_days, "number");
    assert.equal(typeof json.from, "string");
    assert.equal(typeof json.to, "string");
    assert.equal(typeof json.sessions, "number");
    assert.ok(json.main_agent && typeof json.main_agent.total === "number");
    assert.ok(json.subagent_dispatch);
    assert.equal(typeof json.subagent_dispatch.total, "number");
    assert.ok(json.subagent_dispatch.counts);
    assert.ok(json.subagent_dispatch.percentages);
    assert.ok(json.readme_target);
    assert.equal(json.readme_target.sonnet, README_TARGET.sonnet);
  });

  // T24 — main + subagent counts independent
  it("main agent and subagent counts populate independently", async () => {
    const cwd = "/test/indep";
    writeSession(tmp, cwd, "s", [
      // Main opus + subagent haiku
      { ...agentRec({ model: "haiku" }), message: { model: "claude-opus-4-7", content: [{ type: "tool_use", id: "x", name: "Agent", input: { description: "x", subagent_type: "Explore", model: "haiku", prompt: "x" } }] } },
      // Main sonnet + Read tool (no subagent dispatch)
      {
        parentUuid: null,
        isSidechain: false,
        message: { model: "claude-sonnet-4-6", content: [{ type: "tool_use", id: "y", name: "Read", input: {} }] },
        type: "assistant",
        timestamp: "2026-05-09T10:00:00.000Z",
        sessionId: "s",
      },
    ]);
    const { logs } = await captureLogs(() =>
      runStats({ cwd, homedir: tmp, now: NOW, json: true })
    );
    const json = JSON.parse(logs.join("\n"));
    assert.equal(json.main_agent.counts.opus, 1);
    assert.equal(json.main_agent.counts.sonnet, 1);
    assert.equal(json.subagent_dispatch.counts.haiku, 1);
    assert.equal(json.subagent_dispatch.total, 1);
  });

  // T25 — zero calls in window
  it("window with 0 calls shows friendly message", async () => {
    const cwd = "/test/empty-window";
    writeSession(tmp, cwd, "s", [agentRec({ model: "sonnet", ts: "2026-01-01T00:00:00.000Z" })]);
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd, homedir: tmp, now: NOW })
    );
    assert.equal(result, 0);
    assert.match(logs.join("\n"), /0 Agent calls in last 7 days/);
  });

  // T27
  it("rejects non-integer --days with exit 1 and usage hint", async () => {
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd: "/x", homedir: tmp, days: "abc", now: NOW })
    );
    assert.equal(result, 1);
    assert.match(logs.join("\n"), /Invalid `--days` value/);
  });

  // T28
  it("rejects --days 0 with exit 1 and usage hint", async () => {
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd: "/x", homedir: tmp, days: 0, now: NOW })
    );
    assert.equal(result, 1);
    assert.match(logs.join("\n"), /Invalid `--days` value/);
  });

  it("rejects negative --days with exit 1", async () => {
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd: "/x", homedir: tmp, days: -5, now: NOW })
    );
    assert.equal(result, 1);
    assert.match(logs.join("\n"), /Invalid `--days` value/);
  });

  it("rejects fractional --days with exit 1", async () => {
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd: "/x", homedir: tmp, days: 7.5, now: NOW })
    );
    assert.equal(result, 1);
    assert.match(logs.join("\n"), /Invalid `--days` value/);
  });
});

describe("stats — parseStatsArgs CLI parser", () => {
  it("returns default opts on empty argv", () => {
    const r = parseStatsArgs([]);
    assert.ok(r.ok);
    assert.deepEqual(r.opts, { allProjects: false, json: false });
  });

  it("parses --all-projects boolean", () => {
    const r = parseStatsArgs(["--all-projects"]);
    assert.ok(r.ok);
    assert.equal(r.opts.allProjects, true);
  });

  it("parses --json boolean", () => {
    const r = parseStatsArgs(["--json"]);
    assert.ok(r.ok);
    assert.equal(r.opts.json, true);
  });

  it("parses --days N (space-separated value)", () => {
    const r = parseStatsArgs(["--days", "30"]);
    assert.ok(r.ok);
    assert.equal(r.opts.days, 30);
  });

  it("parses --days=N (equals-separated value)", () => {
    const r = parseStatsArgs(["--days=14"]);
    assert.ok(r.ok);
    assert.equal(r.opts.days, 14);
  });

  it("rejects --days with missing value", () => {
    const r = parseStatsArgs(["--days"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Missing value/);
  });

  it("rejects --days followed by another flag as missing value", () => {
    const r = parseStatsArgs(["--days", "--json"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Missing value/);
  });

  it("rejects --days= with empty value as missing", () => {
    const r = parseStatsArgs(["--days="]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Missing value/);
  });

  it("rejects --days=1.5 (fractional)", () => {
    const r = parseStatsArgs(["--days=1.5"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Invalid `--days`/);
  });

  it("rejects --days -3 (negative)", () => {
    const r = parseStatsArgs(["--days", "-3"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Invalid `--days`/);
  });

  it("rejects --days abc as non-integer", () => {
    const r = parseStatsArgs(["--days", "abc"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Invalid `--days`/);
  });

  it("rejects --days=0 as non-positive", () => {
    const r = parseStatsArgs(["--days=0"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Invalid `--days`/);
  });

  it("rejects unknown flags", () => {
    const r = parseStatsArgs(["--bogus"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Unknown flag/);
  });

  it("combines multiple flags", () => {
    const r = parseStatsArgs(["--all-projects", "--days", "30", "--json"]);
    assert.ok(r.ok);
    assert.equal(r.opts.allProjects, true);
    assert.equal(r.opts.json, true);
    assert.equal(r.opts.days, 30);
  });
});

describe("stats — multi-match cwd fallback warning", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-stats-multi-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("warns when two project dirs claim the same cwd via fallback", async () => {
    const cwd = "/Users/test/duplicate-cwd";
    // Two distinct hash dirs both contain a jsonl whose first record has the
    // same cwd as our target. The deterministic hash dir does NOT exist, so
    // the fallback fires and finds 2 matches.
    for (const hashName of ["-other-a", "-other-b"]) {
      const d = join(tmp, ".claude", "projects", hashName);
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, "s.jsonl"),
        JSON.stringify(agentRec({ model: "sonnet", cwd })) + "\n"
      );
    }
    const { logs, result } = await captureLogs(() =>
      runStats({ cwd, homedir: tmp, now: NOW })
    );
    assert.equal(result, 0);
    assert.match(logs.join("\n"), /found 2 project dirs matching/);
  });
});

describe("stats — fixture anchor + layout", () => {
  // T29 — exact counts per plan's fixture-roundtrip outcomes table
  it("fixture roundtrip — exact counts per plan", async () => {
    // Fixture has L1-L9 inside window [2026-05-05..2026-05-12], L15 before, L16 after, L14 malformed.
    const from = new Date("2026-05-05T00:00:00.000Z");
    const to = new Date("2026-05-12T12:00:00.000Z");
    const agg = await aggregateFiles([FIXTURE], from, to);
    // Subagent dispatches: L1 sonnet, L2 opus, L3 haiku, L4 unknown, L9 opus = 5 total
    assert.equal(agg.subagentCounts.sonnet, 1);
    assert.equal(agg.subagentCounts.opus, 2);
    assert.equal(agg.subagentCounts.haiku, 1);
    assert.equal(agg.subagentCounts.unknown, 1);
    // Main agent records: L1-L4 + L6-L9 = 8 total. L1 sonnet; L2-L4 opus; L6 sonnet; L7 haiku; L8 other; L9 opus
    assert.equal(agg.mainCounts.sonnet, 2);
    assert.equal(agg.mainCounts.opus, 4);
    assert.equal(agg.mainCounts.haiku, 1);
    assert.equal(agg.mainCounts.other, 1);
    // linesFailed: 1 (L14)
    assert.equal(agg.linesFailed, 1);
    // linesParsed: 19 (everything except L14 — 20 lines total)
    assert.equal(agg.linesParsed, 19);
    // Percentages over subagent denom = 4 (excludes unknown)
    const p = percentages(agg.subagentCounts);
    assert.equal(p.sonnet, 0.25);
    assert.equal(p.opus, 0.5);
    assert.equal(p.haiku, 0.25);
  });

  // T30 — listSessionFiles non-recursive
  it("listSessionFiles is non-recursive (ignores subagents/ subdir)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "bm-stats-listfiles-"));
    try {
      const hashDir = join(tmp, ".claude", "projects", projectHash("/x/y"));
      mkdirSync(hashDir, { recursive: true });
      writeFileSync(join(hashDir, "root1.jsonl"), "{}\n");
      writeFileSync(join(hashDir, "root2.jsonl"), "{}\n");
      mkdirSync(join(hashDir, "sub-session-id"), { recursive: true });
      mkdirSync(join(hashDir, "sub-session-id", "subagents"), { recursive: true });
      writeFileSync(join(hashDir, "sub-session-id", "subagents", "inner.jsonl"), "{}\n");
      const files = listSessionFiles(hashDir);
      assert.equal(files.length, 2);
      assert.ok(files.every((f) => /root[12]\.jsonl$/.test(f)));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("listSessionFiles returns [] for missing dir", () => {
    assert.deepEqual(listSessionFiles("/nonexistent/path/here"), []);
  });
});

describe("stats — resolveProjectDir cwd-fallback", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bm-stats-resolve-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("uses deterministic hash when dir exists", () => {
    const cwd = "/Users/x/proj";
    writeSession(tmp, cwd, "s", [agentRec({ model: "sonnet" })]);
    const dir = resolveProjectDir(cwd, tmp);
    assert.ok(dir);
    assert.ok(dir.endsWith(projectHash(cwd)));
  });

  it("falls back to cwd-match scan when hash dir absent", () => {
    // Project actually stored under a different hash than the computed one
    // (simulated by writing to a bogus hash dir but with matching cwd field).
    const realCwd = "/Users/test/some-proj";
    const wrongHashDir = join(tmp, ".claude", "projects", "-something-else");
    mkdirSync(wrongHashDir, { recursive: true });
    const rec = agentRec({ model: "sonnet", cwd: realCwd });
    writeFileSync(join(wrongHashDir, "s.jsonl"), JSON.stringify(rec) + "\n");
    const dir = resolveProjectDir(realCwd, tmp);
    assert.equal(dir, wrongHashDir);
  });

  it("returns null when no hash dir and no cwd-match exists", () => {
    mkdirSync(join(tmp, ".claude", "projects", "-other"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "projects", "-other", "s.jsonl"),
      JSON.stringify(agentRec({ model: "sonnet", cwd: "/different/path" })) + "\n"
    );
    const dir = resolveProjectDir("/Users/never/seen", tmp);
    assert.equal(dir, null);
  });
});
