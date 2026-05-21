import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getInstallStatus, detectPackageManager, CLAUDE_MD, TEMPLATE_FILE, REFERENCE_MARKER } from "./detect.js";
import { fix, printFixResults } from "./fix.js";
import { installAgents, AGENTS } from "./agents.js";
import { gitAdd, isGitRepo } from "./git.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_SRC = join(__dirname, "..", "templates", TEMPLATE_FILE);

const BLOCK_START = "<!-- better-model:start -->";
const BLOCK_END = "<!-- better-model:end -->";
const OLD_REFERENCE_LINE = `→ **[Model Selection Guide](docs/${TEMPLATE_FILE})** — when to use Opus/Sonnet/Haiku and effort levels`;

// Every ROUTING_BLOCK carries a version marker so future upgrades can detect
// a stale block by a stable identifier, not by incidental content like effort names.
const CURRENT_BLOCK_VERSION = "0.10";
const BLOCK_VERSION_MARKER = `<!-- better-model block version: ${CURRENT_BLOCK_VERSION} -->`;

// Profiles are an opt-in keyword overlay applied on top of the base routing
// rules (see src/fix.js inferModel). The active profile is encoded inside the
// routing-block markers as a separate metadata comment, orthogonal to
// BLOCK_VERSION_MARKER, so block-version upgrades preserve profile choice.
const PROFILE_MARKER_PREFIX = "<!-- better-model profile: ";
const PROFILE_MARKER_SUFFIX = " -->";
// Validation: profile names are URL-safe ASCII slugs to keep them grep-friendly
// and avoid markdown-rendering surprises.
const VALID_PROFILE_RE = /^[a-z][a-z0-9-]{0,30}$/;
// Currently supported profiles. Unknown values are accepted at the marker
// level (forward compat) but ignored by inferModel until a release adds them.
const KNOWN_PROFILES = ["blockchain"];

/**
 * Build the routing block for the given profile. Pass `null` / `undefined` to
 * emit a block without a profile marker (the default).
 * @param {string|null|undefined} profile
 * @returns {string}
 */
export function buildRoutingBlock(profile) {
  const profileLine = profile ? `\n${PROFILE_MARKER_PREFIX}${profile}${PROFILE_MARKER_SUFFIX}` : "";
  return `${BLOCK_START}
${BLOCK_VERSION_MARKER}${profileLine}
## Model Routing (better-model)

**CRITICAL**: When spawning subagents via the Agent tool, ALWAYS set the \`model\` parameter (and \`effort\` for Sonnet/Opus — Haiku 4.5 does not support effort):
- \`model: "haiku"\` — search, grep, file reading, exploration, status checks (no effort field — Haiku 4.5 does not support it)
- \`model: "sonnet", effort: "medium"\` — code generation, tests, refactoring, bug fixes (1-2 files)
- \`model: "opus", effort: "xhigh"\` — multi-file refactoring (3+ files), code review, migrations, cross-file debugging
- \`model: "opus", effort: "max"\` — architecture design, security audits, novel algorithm design

Default to \`model: "sonnet", effort: "medium"\` when unsure.
Avoid Opus on >500K context — known lost-in-the-middle regression.
See [full decision matrix](docs/${TEMPLATE_FILE}).
${BLOCK_END}`;
}

// Backward-compat alias for callers/tests that just want the default block.
const ROUTING_BLOCK = buildRoutingBlock(null);

/**
 * Read the active profile (if any) directly from the project's CLAUDE.md.
 * Thin wrapper around readProfileFromBlock for callers that have a project
 * root but not the file contents.
 *
 * Used by fix(), audit, and stats to thread the profile through inferModel
 * without exposing block-marker parsing details to those modules.
 *
 * @param {string} projectRoot
 * @returns {string|null}
 */
export function readProjectProfile(projectRoot) {
  const claudeMdPath = join(projectRoot, CLAUDE_MD);
  if (!existsSync(claudeMdPath)) return null;
  let content;
  try {
    content = readFileSync(claudeMdPath, "utf8");
  } catch {
    return null;
  }
  return readProfileFromBlock(content);
}

/**
 * Extract the active profile (if any) from a CLAUDE.md content string. Returns
 * the profile name as a lowercase slug, or `null` if no profile marker is
 * present (or the block markers themselves are missing/malformed).
 * @param {string} content — full CLAUDE.md content
 * @returns {string|null}
 */
export function readProfileFromBlock(content) {
  if (typeof content !== "string") return null;
  const startIdx = content.indexOf(BLOCK_START);
  if (startIdx === -1) return null;
  const endIdx = content.indexOf(BLOCK_END, startIdx);
  if (endIdx === -1) return null;
  const block = content.slice(startIdx, endIdx);
  const m = block.match(/<!-- better-model profile: ([a-z][a-z0-9-]{0,30}) -->/);
  return m ? m[1] : null;
}

export { BLOCK_START, BLOCK_END, ROUTING_BLOCK, BLOCK_VERSION_MARKER, KNOWN_PROFILES, VALID_PROFILE_RE };

/**
 * Detect a routing block that should be upgraded to the current version.
 * Stale = both markers present but the block does not contain the current
 * BLOCK_VERSION_MARKER. Using a version sentinel (rather than incidental
 * content like effort names) keeps future upgrades unambiguous.
 * @param {string} content — full CLAUDE.md content
 * @returns {boolean}
 */
export function isStaleRoutingBlock(content) {
  if (!content.includes(BLOCK_START) || !content.includes(BLOCK_END)) {
    return false;
  }
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END, startIdx);
  // BLOCK_END not found after BLOCK_START — content is truncated or markers
  // are in reverse order. Treat as not-a-block (do not upgrade something
  // we cannot cleanly identify).
  if (endIdx === -1) return false;
  const block = content.slice(startIdx, endIdx + BLOCK_END.length);
  return !block.includes(BLOCK_VERSION_MARKER);
}

/**
 * Replace the existing routing block (identified by start/end markers)
 * with the current routing block. Assumes the caller has already verified
 * both markers are present. The `profile` arg controls the rebuilt block:
 *   - `undefined` (default): preserve any profile encoded in the existing block
 *   - `null`: explicitly remove any profile (write a no-profile block)
 *   - string: explicit profile name; overrides any existing marker
 * @param {string} content
 * @param {string|null} [profile]
 * @returns {string}
 */
function replaceRoutingBlock(content, profile) {
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END, startIdx) + BLOCK_END.length;
  const effective = profile === undefined ? readProfileFromBlock(content) : profile;
  return content.slice(0, startIdx) + buildRoutingBlock(effective) + content.slice(endIdx);
}

/**
 * Install better-model into the target project.
 * @param {string} projectRoot
 * @param {{ soft?: boolean, profile?: string|null }} options
 *   - `soft`: install matrix only, skip agents/frontmatter enforcement
 *   - `profile`: opt-in keyword overlay (e.g. `"blockchain"`). Omit to leave
 *     existing profile choice unchanged on re-install; pass an explicit string
 *     to set/override. `null` is reserved for an explicit clear (future use).
 */
export function init(projectRoot, options = {}) {
  let { soft = false, profile } = options;
  // Normalize empty string to undefined so the preserve-existing path is taken
  // (rather than the silent-clear path that empty string would otherwise hit).
  // The CLI parser already rejects `""`; this guard protects programmatic callers.
  if (profile === "") profile = undefined;
  // Validate profile shape if provided.
  if (typeof profile === "string" && !VALID_PROFILE_RE.test(profile)) {
    console.log(`✗ Invalid \`--profile\` value: \`${profile}\` — must be a lowercase ASCII slug (a-z, 0-9, hyphen).`);
    return;
  }
  const status = getInstallStatus(projectRoot);
  const touchedFiles = [];

  if (status.installed) {
    console.log("✓ better-model is already installed.");
    console.log(`  Template: ${status.templatePath}`);
    console.log(`  Reference in: ${status.claudeMdPath}`);
    // Surface profile state up-front so users running re-init can see it.
    const visibleProfile = readProjectProfile(projectRoot);
    if (visibleProfile && profile === undefined) {
      console.log(`  Profile: ${visibleProfile} (preserved on re-init)`);
    }

    // Upgrade CLAUDE.md in three paths:
    //   1. v0.4.x single-line reference → current routing block
    //   2. v0.5.x routing block (no xhigh) → current routing block
    //   3. v0.6.x routing block (haiku effort: low, unsupported) → current routing block
    //   4. v0.7.x routing block (no profile metadata) → current routing block
    // In all cases: if `profile` option was passed explicitly, apply it;
    // otherwise preserve any existing profile marker.
    const claudeMdPath = join(projectRoot, CLAUDE_MD);
    if (existsSync(claudeMdPath)) {
      let content = readFileSync(claudeMdPath, "utf8");
      const existingProfile = readProfileFromBlock(content);
      const effectiveProfile = profile !== undefined ? profile : existingProfile;
      const profileChanged = profile !== undefined && profile !== existingProfile;
      if (isStaleRoutingBlock(content)) {
        content = replaceRoutingBlock(content, effectiveProfile);
        writeFileSync(claudeMdPath, content);
        touchedFiles.push(CLAUDE_MD);
        console.log(`  Upgraded routing block to v${CURRENT_BLOCK_VERSION}${effectiveProfile ? ` (profile: ${effectiveProfile})` : ""}.`);
      } else if (profileChanged) {
        // Block is current version but profile marker needs updating.
        content = replaceRoutingBlock(content, effectiveProfile);
        writeFileSync(claudeMdPath, content);
        touchedFiles.push(CLAUDE_MD);
        console.log(`  Updated profile in routing block: ${existingProfile ?? "(none)"} → ${effectiveProfile ?? "(none)"}.`);
      } else if (!content.includes(BLOCK_START) && content.includes(OLD_REFERENCE_LINE)) {
        content = content.replace(OLD_REFERENCE_LINE, buildRoutingBlock(effectiveProfile));
        writeFileSync(claudeMdPath, content);
        touchedFiles.push(CLAUDE_MD);
        console.log("  Upgraded v0.4 reference to routing block.");
      }
    }

    if (!soft) {
      // Ensure agents are installed (idempotent)
      const agentResult = installAgents(projectRoot);
      if (agentResult.installed.length > 0) {
        console.log("\n  Installed missing agents:");
        for (const f of agentResult.installed) {
          console.log(`    + .claude/agents/${f}`);
          touchedFiles.push(`.claude/agents/${f}`);
        }
      }

      console.log("\n  Running enforcement check on agents/skills...");
      // Read profile from the (potentially just-updated) CLAUDE.md so the
      // overlay keyword set is honored when injecting frontmatter.
      const activeProfile = readProjectProfile(projectRoot);
      const results = fix(projectRoot, { profile: activeProfile });
      printFixResults(results, false);
      for (const f of results.fixed) touchedFiles.push(f.file);
      stageFiles(projectRoot, touchedFiles);
    }
    printPackageManagerHint(projectRoot);
    return;
  }

  const mode = soft ? "soft" : "enforcement";
  console.log(`  Mode: ${mode}`);
  if (typeof profile === "string") {
    console.log(`  Profile: ${profile} — keyword overlay activated for inference (see templates/profiles/${profile}.md).`);
    if (soft) {
      console.log(`  Note: soft mode skips agent install. Run \`npx better-model audit --fix\` later to apply ${profile} keywords to your agents.`);
    }
  }

  // Ensure docs directory exists
  const docsDir = status.docsDir;
  const docsDirAbs = join(projectRoot, docsDir);
  if (!existsSync(docsDirAbs)) {
    mkdirSync(docsDirAbs, { recursive: true });
    console.log(`  Created ${docsDir}/`);
  }

  // Copy template
  const templateRel = `${docsDir}/${TEMPLATE_FILE}`;
  const destPath = join(docsDirAbs, TEMPLATE_FILE);
  if (!existsSync(destPath)) {
    copyFileSync(TEMPLATE_SRC, destPath);
    console.log(`  Copied ${templateRel}`);
  }
  touchedFiles.push(templateRel);

  // Add routing block to CLAUDE.md
  const claudeMdPath = join(projectRoot, CLAUDE_MD);
  const initialBlock = buildRoutingBlock(profile ?? null);
  if (existsSync(claudeMdPath)) {
    let content = readFileSync(claudeMdPath, "utf8");
    if (isStaleRoutingBlock(content)) {
      // Upgrade older routing block (v0.5.x / v0.6.x / v0.7.x) → current block.
      // Preserve any existing profile unless the caller passed an explicit one.
      content = replaceRoutingBlock(content, profile);
      writeFileSync(claudeMdPath, content);
      console.log(`  Upgraded routing block to v${CURRENT_BLOCK_VERSION} in ${CLAUDE_MD}`);
    } else if (content.includes(BLOCK_START)) {
      // Already has current block — skip
    } else if (content.includes(OLD_REFERENCE_LINE)) {
      // Upgrade v0.4.x single-line reference → current block
      content = content.replace(OLD_REFERENCE_LINE, initialBlock);
      writeFileSync(claudeMdPath, content);
      console.log(`  Upgraded v0.4 reference to routing block in ${CLAUDE_MD}`);
    } else if (!content.includes(REFERENCE_MARKER)) {
      writeFileSync(claudeMdPath, content.trimEnd() + "\n\n" + initialBlock + "\n");
      console.log(`  Added routing block to ${CLAUDE_MD}`);
    }
  } else {
    writeFileSync(claudeMdPath, initialBlock + "\n");
    console.log(`  Created ${CLAUDE_MD} with routing block`);
  }
  touchedFiles.push(CLAUDE_MD);

  // Install agents (enforcement mode only)
  if (!soft) {
    const agentResult = installAgents(projectRoot);
    if (agentResult.installed.length > 0) {
      console.log("\n  Installed agents:");
      for (const f of agentResult.installed) {
        console.log(`    + .claude/agents/${f}`);
        touchedFiles.push(`.claude/agents/${f}`);
      }
    }
    if (agentResult.skipped.length > 0) {
      console.log("\n  Skipped agents (already exist):");
      for (const f of agentResult.skipped) {
        console.log(`    ~ .claude/agents/${f}`);
      }
    }

    // Inject model frontmatter into any other agents/skills.
    // Read profile from the just-written CLAUDE.md so blockchain overlay
    // keywords (if active) are honored during enforcement.
    const activeProfile = readProjectProfile(projectRoot);
    const results = fix(projectRoot, { profile: activeProfile });
    if (results.fixed.length > 0 || results.skipped.length > 0) {
      console.log("\n  Enforcement — injecting model frontmatter:");
      printFixResults(results, false);
    }
    for (const f of results.fixed) touchedFiles.push(f.file);
  }

  // Auto git-add all touched files
  const staged = stageFiles(projectRoot, touchedFiles);

  console.log("✓ better-model installed successfully.");
  if (soft) {
    console.log("  Mode: soft — decision matrix as reference only.");
  } else {
    console.log("  Mode: enforcement — model frontmatter injected into agents/skills.");
  }

  if (staged.length === 0 && isGitRepo(projectRoot)) {
    console.log(`\n  Next: git add ${templateRel} ${CLAUDE_MD}`);
  }

  printPackageManagerHint(projectRoot);
}

/**
 * Print a one-shot hint when the project is managed by pnpm/yarn/bun so users
 * know how to invoke better-model without npm warnings on pnpm-specific
 * `.npmrc` keys (which npm 12 will reject outright).
 * @param {string} projectRoot
 */
function printPackageManagerHint(projectRoot) {
  const pm = detectPackageManager(projectRoot);
  if (!pm) return;
  const dlxCmd = pm === "bun" ? "bunx" : `${pm} dlx`;
  console.log(`\n  Tip: this project uses ${pm}. Next time, run:`);
  console.log(`    ${dlxCmd} better-model@latest init`);
  console.log(`  to avoid npm warnings on pnpm-style .npmrc keys`);
  console.log(`  (npm 12 will reject them — see https://pnpm.io/settings).`);
}

/**
 * Parse CLI arguments for the `init` subcommand. Mirrors `parseStatsArgs`
 * in `src/stats.js` so the two parsers behave consistently (space/equals
 * value forms, friendly error messages, unknown flag rejection).
 *
 * @param {string[]} argv — argv slice AFTER the "init" command word
 * @returns {{ok:true, opts:{soft:boolean, profile?:string}}|{ok:false, error:string}}
 */
export function parseInitArgs(argv) {
  const opts = { soft: false };
  let profileSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--soft") {
      opts.soft = true;
      continue;
    }
    if (a === "--profile") {
      if (profileSeen) {
        return { ok: false, error: "Duplicate `--profile` flag. Pass only one profile per `init` invocation." };
      }
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) {
        return { ok: false, error: "Missing value for `--profile`. Try `--profile blockchain`." };
      }
      if (!VALID_PROFILE_RE.test(v)) {
        return { ok: false, error: `Invalid \`--profile\` value: \`${v}\` — must be a lowercase ASCII slug (a-z, 0-9, hyphen).` };
      }
      opts.profile = v;
      profileSeen = true;
      continue;
    }
    if (a.startsWith("--profile=")) {
      if (profileSeen) {
        return { ok: false, error: "Duplicate `--profile` flag. Pass only one profile per `init` invocation." };
      }
      const v = a.slice("--profile=".length);
      if (v === "") {
        return { ok: false, error: "Missing value for `--profile`. Try `--profile=blockchain`." };
      }
      if (!VALID_PROFILE_RE.test(v)) {
        return { ok: false, error: `Invalid \`--profile\` value: \`${v}\` — must be a lowercase ASCII slug (a-z, 0-9, hyphen).` };
      }
      opts.profile = v;
      profileSeen = true;
      continue;
    }
    return { ok: false, error: `Unknown flag \`${a}\`. Run \`better-model --help\` for usage.` };
  }
  return { ok: true, opts };
}

/**
 * Stage files and print what was staged.
 * @param {string} projectRoot
 * @param {string[]} files
 * @returns {string[]}
 */
function stageFiles(projectRoot, files) {
  if (files.length === 0) return [];
  const staged = gitAdd(projectRoot, files);
  if (staged.length > 0) {
    console.log(`\n  Staged ${staged.length} file(s) in git:`);
    for (const f of staged) {
      console.log(`    + ${f}`);
    }
  }
  return staged;
}
