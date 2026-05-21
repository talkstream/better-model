import {
  createReadStream,
  existsSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { homedir as osHomedir } from "node:os";
import { inferModel, parseFrontmatter } from "./fix.js";
import { readProjectProfile } from "./init.js";

/**
 * README target distribution for subagent dispatch — pinned to the README at
 * release time. Kept as a constant (not parsed from README) because the README
 * format will drift; this constant updates with intent.
 */
export const README_TARGET = Object.freeze({ sonnet: 0.556, opus: 0.328, haiku: 0.117 });

const PROJECTS_DIR_NAME = "projects";
const MS_PER_DAY = 86_400_000;
const DEFAULT_DAYS = 7;
const FIRST_LINE_PROBE_BYTES = 32768;
const MAX_CWD_PROBE_RECORDS = 10;

/**
 * Convert an absolute cwd to the on-disk hash used by Claude Code:
 * "/Users/x/proj" -> "-Users-x-proj".
 * @param {string} cwdAbs
 * @returns {string}
 */
export function projectHash(cwdAbs) {
  return cwdAbs.replace(/\//g, "-");
}

/**
 * Return absolute paths of *.jsonl files directly in projectDir.
 * Non-recursive: ignores subdirectories (subagents/ inner sessions).
 * Returns [] if dir missing/unreadable/empty.
 * @param {string} projectDir
 * @returns {string[]}
 */
export function listSessionFiles(projectDir) {
  let entries;
  try {
    entries = readdirSync(projectDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(join(projectDir, entry.name));
    }
  }
  return files;
}

/**
 * Resolve the on-disk directory holding session JSONLs for the given cwd.
 * Tries the deterministic hash first; falls back to scanning all project dirs
 * and matching the first record's cwd field. Always returns a directory path
 * (never a file path) or null.
 * @param {string} cwdAbs
 * @param {string} homedir
 * @returns {string|null}
 */
export function resolveProjectDir(cwdAbs, homedir) {
  return resolveProjectDirInfo(cwdAbs, homedir).dir;
}

/**
 * Like resolveProjectDir, but also returns how many directories matched the
 * cwd-fallback scan. runStats uses this to surface a friendly warning when
 * more than one project dir claims the same cwd (rare but possible).
 * @param {string} cwdAbs
 * @param {string} homedir
 * @returns {{dir: string|null, matchCount: number, viaFallback: boolean}}
 */
export function resolveProjectDirInfo(cwdAbs, homedir) {
  const projectsRoot = join(homedir, ".claude", PROJECTS_DIR_NAME);
  if (!existsSync(projectsRoot)) return { dir: null, matchCount: 0, viaFallback: false };
  const hashDir = join(projectsRoot, projectHash(cwdAbs));
  if (existsSync(hashDir)) return { dir: hashDir, matchCount: 1, viaFallback: false };
  // Fallback: scan every project dir, peek first jsonl, match cwd.
  let bestMatch = null;
  let bestMtime = 0;
  let matchCount = 0;
  for (const entry of safeReaddir(projectsRoot)) {
    if (!entry.isDirectory()) continue;
    const candidate = join(projectsRoot, entry.name);
    if (!firstFileCwdMatches(candidate, cwdAbs)) continue;
    matchCount++;
    let mtime = 0;
    try {
      mtime = statSync(candidate).mtimeMs;
    } catch {
      mtime = 0;
    }
    if (mtime >= bestMtime) {
      bestMatch = candidate;
      bestMtime = mtime;
    }
  }
  return { dir: bestMatch, matchCount, viaFallback: bestMatch !== null };
}

/**
 * Normalize a full Claude model ID to a short bucket name.
 * @param {string|null|undefined} modelId
 * @returns {"opus"|"sonnet"|"haiku"|"other"|null}
 */
export function normalizeMainModel(modelId) {
  if (!modelId || typeof modelId !== "string") return null;
  if (/^claude-opus-/.test(modelId)) return "opus";
  if (/^claude-sonnet-/.test(modelId)) return "sonnet";
  if (/^claude-haiku-/.test(modelId)) return "haiku";
  return "other";
}

/**
 * Async generator yielding parsed records or parse-failure markers.
 * Streams via node:readline — never loads the full file into memory.
 * Yields {ok:true, record} on parse success, {ok:false} on parse failure.
 * @param {string} filePath
 * @returns {AsyncGenerator<{ok:boolean, record?:object}>}
 */
export async function* readJsonl(filePath) {
  let stream;
  try {
    stream = createReadStream(filePath, { encoding: "utf8" });
  } catch {
    return;
  }
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        yield { ok: true, record: JSON.parse(line) };
      } catch {
        yield { ok: false };
      }
    }
  } catch {
    // Stream error during iteration (ENOENT, EACCES, EISDIR, truncate-race).
    // Treat the file as unreadable rather than crashing the whole aggregation.
  } finally {
    rl.close();
  }
}

/**
 * Extract subagent dispatch details from a single record. Returns one entry
 * per Agent tool_use block: {model, subagent_type, description}. `model` is
 * "unknown" if `input.model` is missing. `subagent_type` is "" if missing.
 * Returns [] for sidechain, non-assistant, or content-less records.
 * @param {object} record
 * @returns {Array<{model:string, subagent_type:string, description:string}>}
 */
export function extractSubagentDispatches(record) {
  if (!record || record.type !== "assistant") return [];
  if (record.isSidechain === true) return [];
  const content = record.message && Array.isArray(record.message.content)
    ? record.message.content
    : null;
  if (!content) return [];
  const out = [];
  for (const block of content) {
    if (!block || block.type !== "tool_use" || block.name !== "Agent") continue;
    const input = block.input || {};
    const model = typeof input.model === "string" ? input.model : "unknown";
    const subagent_type = typeof input.subagent_type === "string" ? input.subagent_type : "";
    const description = typeof input.description === "string" ? input.description : "";
    out.push({ model, subagent_type, description });
  }
  return out;
}

/**
 * Extract subagent dispatch model strings from a single record. Thin wrapper
 * over extractSubagentDispatches for callers that only care about models.
 * Kept for API stability — existing tests and aggregateFiles use this shape.
 * @param {object} record
 * @returns {string[]}
 */
export function extractSubagentModels(record) {
  return extractSubagentDispatches(record).map((d) => d.model);
}

/**
 * Load per-agent expected-model map from `<projectRoot>/.claude/agents/*.md`.
 * Returns Map<agentName, normalizedModel> where normalizedModel is one of
 * "opus" | "sonnet" | "haiku" extracted from frontmatter. Agents without a
 * model: field are omitted. Returns empty Map if dir missing/unreadable.
 *
 * Used to build the expected-model side of deviation detection: when a user
 * project has `.claude/agents/code-reviewer.md` with `model: sonnet` in
 * frontmatter, dispatches to `code-reviewer` are expected to be sonnet, not
 * what inferModel() infers from keyword.
 *
 * @param {string} projectRoot — absolute path
 * @returns {Map<string, string>}
 */
export function loadProjectAgents(projectRoot) {
  const result = new Map();
  const agentsDir = join(projectRoot, ".claude", "agents");
  if (!existsSync(agentsDir)) return result;
  let entries;
  try {
    entries = readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const name = entry.name.replace(/\.md$/, "");
    let content;
    try {
      content = readFileSync(join(agentsDir, entry.name), "utf8");
    } catch {
      continue;
    }
    const { fields } = parseFrontmatter(content);
    if (typeof fields.model !== "string") continue;
    // Normalize to short name — frontmatter is "opus"/"sonnet"/"haiku" already
    // per fix.js conventions, but tolerate full IDs defensively.
    const short = normalizeFrontmatterModel(fields.model);
    if (short) result.set(name, short);
  }
  return result;
}

/**
 * Compute the expected model for a dispatch. Prefers `projectAgents` if the
 * subagent_type matches a loaded agent's frontmatter; falls back to inferModel
 * on the (name, description) pair. When the current project has a profile
 * active (e.g. blockchain) it is forwarded to inferModel so the overlay
 * keyword set is honored for inference-tier expectations.
 *
 * @param {string} subagent_type
 * @param {string} description
 * @param {Map<string,string>|null} projectAgents — null in --all-projects mode
 * @param {string|null} [profile] — active profile, null in --all-projects mode
 * @returns {{model:string, source:"frontmatter"|"inference"}}
 */
export function computeExpectedModel(subagent_type, description, projectAgents, profile) {
  if (projectAgents && projectAgents.has(subagent_type)) {
    return { model: projectAgents.get(subagent_type), source: "frontmatter" };
  }
  const inferred = inferModel(subagent_type, description, profile ?? undefined);
  return { model: inferred.model, source: "inference" };
}

/**
 * Extract the normalized main-agent model from a single assistant record.
 * @param {object} record
 * @returns {"opus"|"sonnet"|"haiku"|"other"|null}
 */
export function extractMainAgentModel(record) {
  if (!record || record.type !== "assistant") return null;
  if (record.isSidechain === true) return null;
  const m = record.message && typeof record.message.model === "string"
    ? record.message.model
    : null;
  return normalizeMainModel(m);
}

/**
 * Aggregate across files within [from, to]. Optionally collects per-subagent_type
 * breakdown when `projectAgents` is provided (current-project mode) or
 * `expectationSource: "inference-only"` is set (--all-projects mode).
 *
 * @param {string[]} files
 * @param {Date} from
 * @param {Date} to
 * @param {{projectAgents?: Map<string,string>|null, computeByType?: boolean, profile?: string|null}} [opts]
 * @returns {Promise<{
 *   mainCounts: {opus:number, sonnet:number, haiku:number, other:number},
 *   subagentCounts: {opus:number, sonnet:number, haiku:number, unknown:number},
 *   byType: Map<string, {total:number, deviations:number, models:{opus:number, sonnet:number, haiku:number, unknown:number}, expectationSource:string}>,
 *   sessions: number,
 *   linesParsed: number,
 *   linesFailed: number,
 * }>}
 */
export async function aggregateFiles(files, from, to, opts = {}) {
  const mainCounts = { opus: 0, sonnet: 0, haiku: 0, other: 0 };
  const subagentCounts = { opus: 0, sonnet: 0, haiku: 0, unknown: 0 };
  const byType = new Map();
  const { projectAgents = null, computeByType = true, profile = null } = opts;
  let linesParsed = 0;
  let linesFailed = 0;
  for (const file of files) {
    for await (const item of readJsonl(file)) {
      if (!item.ok) {
        linesFailed++;
        continue;
      }
      linesParsed++;
      const { record } = item;
      if (!record.timestamp) continue;
      const ts = new Date(record.timestamp);
      if (Number.isNaN(ts.getTime())) continue;
      if (ts < from || ts > to) continue;
      const main = extractMainAgentModel(record);
      if (main && main in mainCounts) mainCounts[main]++;
      for (const dispatch of extractSubagentDispatches(record)) {
        const m = dispatch.model;
        if (m in subagentCounts) subagentCounts[m]++;
        else subagentCounts.unknown++;
        if (!computeByType) continue;
        addToByType(byType, dispatch, projectAgents, profile);
      }
    }
  }
  return {
    mainCounts,
    subagentCounts,
    byType,
    sessions: files.length,
    linesParsed,
    linesFailed,
  };
}

/**
 * Update the byType map for one dispatch. Tracks per-type total, model
 * distribution, and deviations (actual model != expected model). Skips
 * deviation calculation when actual model is "unknown" (no input.model on
 * the Agent call — comparison would be meaningless).
 *
 * `expectationSource` is recorded per type: "frontmatter" when at least one
 * dispatch matched a project-agent frontmatter; "inference" otherwise.
 * "mixed" if both happened (rare — would indicate inconsistent fixture).
 *
 * @param {Map<string,object>} byType
 * @param {{model:string, subagent_type:string, description:string}} dispatch
 * @param {Map<string,string>|null} projectAgents
 * @param {string|null} profile — active profile, forwarded to inference
 */
function addToByType(byType, dispatch, projectAgents, profile) {
  const key = dispatch.subagent_type || "(empty)";
  let row = byType.get(key);
  if (!row) {
    row = {
      total: 0,
      deviations: 0,
      models: { opus: 0, sonnet: 0, haiku: 0, unknown: 0 },
      expectationSource: null,
    };
    byType.set(key, row);
  }
  row.total++;
  const bucket = dispatch.model in row.models ? dispatch.model : "unknown";
  row.models[bucket]++;
  // Deviation only computed for dispatches with a real model (not "unknown").
  if (bucket === "unknown") return;
  const expected = computeExpectedModel(dispatch.subagent_type, dispatch.description, projectAgents, profile);
  if (expected.model !== dispatch.model) row.deviations++;
  if (row.expectationSource === null) {
    row.expectationSource = expected.source;
  } else if (row.expectationSource !== expected.source) {
    row.expectationSource = "mixed";
  }
}

/**
 * Compute percentages excluding "unknown" / "other" buckets.
 * @param {{[k:string]:number}} counts
 * @returns {{sonnet:number, opus:number, haiku:number}}
 */
export function percentages(counts) {
  const s = counts.sonnet || 0;
  const o = counts.opus || 0;
  const h = counts.haiku || 0;
  const denom = s + o + h;
  if (denom === 0) return { sonnet: 0, opus: 0, haiku: 0 };
  return { sonnet: s / denom, opus: o / denom, haiku: h / denom };
}

/**
 * Render text output. No fixed-width layout; works at any terminal width.
 * Never emits prompts, UUIDs, or session IDs (privacy invariant).
 * @param {object} result
 * @returns {string}
 */
export function formatText(result) {
  const lines = [];
  lines.push(`better-model stats — ${result.scope}`);
  lines.push(`Window: last ${result.windowDays} days (${result.fromIso} → ${result.toIso})`);
  lines.push(`Source: ${result.sessions} session file${plural(result.sessions)}, ${result.subagentCalls} Agent call${plural(result.subagentCalls)}`);
  lines.push("");
  lines.push("Main agent (your Claude Code setting — better-model does NOT control):");
  if (result.mainTotal === 0) {
    lines.push("  (no main agent records in window)");
  } else {
    for (const [label, count] of mainBucketsForDisplay(result.mainCounts)) {
      const pct = (count / result.mainTotal) * 100;
      lines.push(`  ${label.padEnd(8)} ${pct.toFixed(1).padStart(5)}%  (${count} turn${plural(count)})`);
    }
  }
  lines.push("");
  lines.push("Subagent dispatch (controlled by better-model routing):");
  if (result.subagentCalls === 0) {
    lines.push(`  0 Agent calls in last ${result.windowDays} days. Try \`--days 30\` for a longer window.`);
  } else {
    for (const m of ["sonnet", "opus", "haiku"]) {
      const c = result.subagentCounts[m];
      const p = result.subagentPct[m] * 100;
      lines.push(`  ${capitalize(m).padEnd(8)} ${p.toFixed(1).padStart(5)}%  (${c} call${plural(c)})`);
    }
    if (result.subagentCounts.unknown > 0) {
      lines.push(`  Unknown ${result.subagentCounts.unknown} call${plural(result.subagentCounts.unknown)} (Agent without input.model; excluded from %)`);
    }
    lines.push("");
    lines.push(`Compared to README target (Sonnet ${pctStr(README_TARGET.sonnet)} / Opus ${pctStr(README_TARGET.opus)} / Haiku ${pctStr(README_TARGET.haiku)}):`);
    for (const m of ["sonnet", "opus", "haiku"]) {
      const cmp = compareMark(result.subagentPct[m], README_TARGET[m]);
      const sign = cmp.diff >= 0 ? "+" : "-";
      const num = Math.abs(cmp.diff).toFixed(1);
      const signed = `${sign}${num}`.padStart(6);
      lines.push(`  ${cmp.mark} ${capitalize(m).padEnd(8)} ${signed} pp`);
    }
    if (result.byType && result.byType.size > 0) {
      lines.push("");
      lines.push("Subagent dispatch by type (deviations vs frontmatter or inference):");
      const rows = [...result.byType.entries()].sort((a, b) => b[1].total - a[1].total);
      const maxNameLen = Math.max(...rows.map(([name]) => name.length), 4);
      const header = `  ${"type".padEnd(maxNameLen)}  total  dev   Sonnet%   Opus%  Haiku%`;
      lines.push(header);
      for (const [name, row] of rows) {
        const routed = row.models.sonnet + row.models.opus + row.models.haiku;
        const sPct = routed > 0 ? (100 * row.models.sonnet / routed).toFixed(0) : "—";
        const oPct = routed > 0 ? (100 * row.models.opus / routed).toFixed(0) : "—";
        const hPct = routed > 0 ? (100 * row.models.haiku / routed).toFixed(0) : "—";
        lines.push(
          `  ${name.padEnd(maxNameLen)}  ${String(row.total).padStart(5)}  ${String(row.deviations).padStart(3)}  ${sPct.padStart(7)}  ${oPct.padStart(6)}  ${hPct.padStart(6)}`
        );
      }
      lines.push("");
      lines.push("  Deviations = actual model ≠ expected (frontmatter when available, else inferred from agent name + description).");
      lines.push("  Most deviations are intentional caller-side overrides matching your preference — see README \"Per-subagent_type breakdown\" before tuning.");
    }
  }
  return lines.join("\n");
}

/**
 * Render JSON output. Schema is stable for scripting.
 * Never emits prompts, UUIDs, or session IDs.
 * @param {object} result
 * @returns {string}
 */
export function formatJson(result) {
  return JSON.stringify({
    project: result.scope,
    window_days: result.windowDays,
    from: result.fromIso,
    to: result.toIso,
    sessions: result.sessions,
    main_agent: {
      total: result.mainTotal,
      counts: result.mainCounts,
    },
    subagent_dispatch: {
      total: result.subagentCalls,
      counts: result.subagentCounts,
      percentages: {
        sonnet: round3(result.subagentPct.sonnet),
        opus: round3(result.subagentPct.opus),
        haiku: round3(result.subagentPct.haiku),
      },
      by_type: serializeByType(result.byType),
    },
    readme_target: README_TARGET,
  }, null, 2);
}

/**
 * Convert byType Map to plain object for JSON output. Keys sorted alphabetically
 * for deterministic output (helpful for diffs / CI fixtures).
 * @param {Map<string,object>|null|undefined} byType
 * @returns {Record<string, object>}
 */
function serializeByType(byType) {
  if (!byType || byType.size === 0) return {};
  const out = {};
  const keys = [...byType.keys()].sort();
  for (const key of keys) {
    const row = byType.get(key);
    const routed = row.models.sonnet + row.models.opus + row.models.haiku;
    out[key] = {
      total: row.total,
      deviations: row.deviations,
      deviation_rate: routed > 0 ? round3(row.deviations / routed) : 0,
      models: { ...row.models },
      // `null` means no real-model dispatch was ever evaluated against an
      // expectation (the row contained only "unknown" model dispatches), so
      // neither "frontmatter" nor "inference" honestly fits — emit "none".
      expectation_source: row.expectationSource ?? "none",
    };
  }
  return out;
}

/**
 * Parse CLI arguments for the `stats` subcommand. Supports `--flag value` and
 * `--flag=value` forms — the existing audit.js pattern (`new Set(args)`) only
 * handles boolean flags, so stats needs its own parser. Unknown flags or
 * malformed `--days` produce {ok: false, error} which the caller turns into
 * a friendly exit-1 message.
 * @param {string[]} argv — argv slice AFTER the "stats" command word
 * @returns {{ok:true, opts:{days?:number, allProjects:boolean, json:boolean}}|{ok:false, error:string}}
 */
export function parseStatsArgs(argv) {
  const opts = { allProjects: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all-projects") {
      opts.allProjects = true;
      continue;
    }
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--days") {
      const v = argv[++i];
      // A bare `--days` at end of argv, or `--days --json` (next token is a
      // flag, not a value), is "missing value", not "invalid value".
      if (v === undefined || v.startsWith("--")) {
        return { ok: false, error: "Missing value for `--days`. Try `--days 7`." };
      }
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) {
        return { ok: false, error: `Invalid \`--days\` value: \`${v}\` — must be a positive integer.` };
      }
      opts.days = n;
      continue;
    }
    if (a.startsWith("--days=")) {
      const v = a.slice("--days=".length);
      if (v === "") {
        return { ok: false, error: "Missing value for `--days`. Try `--days=7`." };
      }
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) {
        return { ok: false, error: `Invalid \`--days\` value: \`${v}\` — must be a positive integer.` };
      }
      opts.days = n;
      continue;
    }
    return { ok: false, error: `Unknown flag \`${a}\`. Run \`better-model --help\` for usage.` };
  }
  return { ok: true, opts };
}

/**
 * Orchestrate stats command: discover files, aggregate, render.
 * @param {{
 *   cwd: string,
 *   days?: number,
 *   allProjects?: boolean,
 *   json?: boolean,
 *   homedir?: string,
 *   now?: Date,
 * }} opts
 * @returns {Promise<number>} exit code
 */
export async function runStats(opts) {
  const days = opts.days ?? DEFAULT_DAYS;
  // Validate days at the boundary: must be a positive integer. Anything else
  // is a user error (CLI parser bug, malformed call) — exit 1 with a helpful
  // message rather than producing nonsense stats.
  if (!Number.isInteger(days) || days <= 0) {
    console.log("Invalid `--days` value: must be a positive integer. Try `--days 7`.");
    return 1;
  }
  const homedir = opts.homedir ?? osHomedir();
  const now = opts.now ?? new Date();
  const to = now;
  const from = new Date(to.getTime() - days * MS_PER_DAY);
  const cwdAbs = resolve(opts.cwd);
  const projectsRoot = join(homedir, ".claude", "projects");

  let files = [];
  let scope = "";
  let projectAgents = null;
  let profile = null;

  if (!existsSync(projectsRoot)) {
    console.log("Claude Code logs not found. Run a session first to generate data.");
    return 0;
  }

  if (opts.allProjects) {
    for (const entry of safeReaddir(projectsRoot)) {
      if (!entry.isDirectory()) continue;
      files.push(...listSessionFiles(join(projectsRoot, entry.name)));
    }
    scope = "all projects";
    // Cross-project agent frontmatter is unreachable: agent .md files live in
    // each project's source tree, not under ~/.claude/projects/. by-type
    // deviation falls back to inference-only.
  } else {
    const info = resolveProjectDirInfo(cwdAbs, homedir);
    if (!info.dir) {
      console.log(`No data for this project yet. Hash: \`${projectHash(cwdAbs)}\`. Try \`--all-projects\` for an aggregate view.`);
      return 0;
    }
    if (info.viaFallback && info.matchCount >= 2) {
      console.log(`Note: found ${info.matchCount} project dirs matching this cwd; using most recent. Use \`--all-projects\` to aggregate all.`);
    }
    files = listSessionFiles(info.dir);
    scope = cwdAbs;
    // Load current-project agent frontmatter for by-type expectation.
    projectAgents = loadProjectAgents(cwdAbs);
    // Load current-project profile so blockchain-overlay agents (when active)
    // are evaluated against the same keyword set the routing block declares.
    profile = readProjectProfile(cwdAbs);
  }

  if (files.length === 0) {
    console.log("No session data. Run a Claude Code session to generate data.");
    return 0;
  }

  const agg = await aggregateFiles(files, from, to, { projectAgents, profile });
  if (agg.linesParsed === 0 && agg.linesFailed > 0) {
    console.log("All session files unreadable. Schema may have changed — please file an issue with your Claude Code version.");
    return 1;
  }

  const mainTotal =
    agg.mainCounts.opus + agg.mainCounts.sonnet + agg.mainCounts.haiku + agg.mainCounts.other;
  const subagentCalls =
    agg.subagentCounts.opus + agg.subagentCounts.sonnet + agg.subagentCounts.haiku + agg.subagentCounts.unknown;
  const subagentPct = percentages(agg.subagentCounts);

  const result = {
    scope,
    windowDays: days,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    sessions: agg.sessions,
    mainCounts: agg.mainCounts,
    mainTotal,
    subagentCounts: agg.subagentCounts,
    subagentCalls,
    subagentPct,
    byType: agg.byType,
  };

  console.log(opts.json ? formatJson(result) : formatText(result));
  return 0;
}

// --- internal helpers ---

function safeReaddir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function firstFileCwdMatches(candidateDir, cwdAbs) {
  const files = listSessionFiles(candidateDir);
  for (const file of files) {
    const cwd = firstCwdInFileSync(file);
    if (cwd === cwdAbs) return true;
  }
  return false;
}

function firstCwdInFileSync(filePath) {
  let fd;
  try {
    fd = openSync(filePath, "r");
    const buf = Buffer.alloc(FIRST_LINE_PROBE_BYTES);
    const n = readSync(fd, buf, 0, FIRST_LINE_PROBE_BYTES, 0);
    const text = buf.subarray(0, n).toString("utf8");
    // Scan up to MAX_CWD_PROBE_RECORDS records — early ones may be
    // user/system/attachment records without a `cwd` field; the plan's
    // robustness matrix calls for tolerating ~23% cwd-absent records.
    const lines = text.split("\n");
    const probe = Math.min(lines.length, MAX_CWD_PROBE_RECORDS);
    for (let i = 0; i < probe; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (typeof rec.cwd === "string") return rec.cwd;
      } catch {
        // Skip malformed line, continue probing.
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignored — best-effort close
      }
    }
  }
}

function mainBucketsForDisplay(counts) {
  return [
    ["Opus", counts.opus],
    ["Sonnet", counts.sonnet],
    ["Haiku", counts.haiku],
    ["Other", counts.other],
  ].filter(([, c]) => c > 0);
}

/**
 * Normalize a frontmatter model value to a short bucket name. Accepts both
 * short ("opus") and full ("claude-opus-4-7") forms — `audit --fix` writes
 * short names, but user-edited files may use full IDs.
 * @param {string} value
 * @returns {"opus"|"sonnet"|"haiku"|null}
 */
function normalizeFrontmatterModel(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "opus" || v === "sonnet" || v === "haiku") return v;
  // Tolerate full IDs.
  if (v.startsWith("claude-opus-")) return "opus";
  if (v.startsWith("claude-sonnet-")) return "sonnet";
  if (v.startsWith("claude-haiku-")) return "haiku";
  return null;
}

function compareMark(actual, target) {
  const diff = (actual - target) * 100;
  const abs = Math.abs(diff);
  let mark = "✗";
  if (abs <= 5) mark = "✓";
  else if (abs <= 15) mark = "⚠";
  return { mark, diff };
}

function plural(n) {
  return n === 1 ? "" : "s";
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pctStr(x) {
  return (x * 100).toFixed(1) + "%";
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}
