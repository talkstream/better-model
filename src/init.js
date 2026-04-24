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
const CURRENT_BLOCK_VERSION = "0.6";
const BLOCK_VERSION_MARKER = `<!-- better-model block version: ${CURRENT_BLOCK_VERSION} -->`;

const ROUTING_BLOCK = `${BLOCK_START}
${BLOCK_VERSION_MARKER}
## Model Routing (better-model)

**CRITICAL**: When spawning subagents via the Agent tool, ALWAYS set the \`model\` and \`effort\` parameters:
- \`model: "haiku", effort: "low"\` — search, grep, file reading, exploration, status checks
- \`model: "sonnet", effort: "medium"\` — code generation, tests, refactoring, bug fixes (1-2 files)
- \`model: "opus", effort: "xhigh"\` — multi-file refactoring (3+ files), code review, migrations, cross-file debugging
- \`model: "opus", effort: "max"\` — architecture design, security audits, novel algorithm design

Default to \`model: "sonnet", effort: "medium"\` when unsure.
Avoid Opus on >500K context — known lost-in-the-middle regression.
See [full decision matrix](docs/${TEMPLATE_FILE}).
${BLOCK_END}`;

export { BLOCK_START, BLOCK_END, ROUTING_BLOCK, BLOCK_VERSION_MARKER };

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
 * with the current ROUTING_BLOCK. Assumes the caller has already verified
 * both markers are present.
 * @param {string} content
 * @returns {string}
 */
function replaceRoutingBlock(content) {
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END, startIdx) + BLOCK_END.length;
  return content.slice(0, startIdx) + ROUTING_BLOCK + content.slice(endIdx);
}

/**
 * Install better-model into the target project.
 * @param {string} projectRoot
 * @param {{ soft?: boolean }} options
 */
export function init(projectRoot, options = {}) {
  const { soft = false } = options;
  const status = getInstallStatus(projectRoot);
  const touchedFiles = [];

  if (status.installed) {
    console.log("✓ better-model is already installed.");
    console.log(`  Template: ${status.templatePath}`);
    console.log(`  Reference in: ${status.claudeMdPath}`);

    // Upgrade CLAUDE.md in two paths:
    //   1. v0.4.x single-line reference → v0.6 routing block
    //   2. v0.5.x routing block (opus/high, no xhigh) → v0.6 routing block
    const claudeMdPath = join(projectRoot, CLAUDE_MD);
    if (existsSync(claudeMdPath)) {
      let content = readFileSync(claudeMdPath, "utf8");
      if (isStaleRoutingBlock(content)) {
        content = replaceRoutingBlock(content);
        writeFileSync(claudeMdPath, content);
        touchedFiles.push(CLAUDE_MD);
        console.log("  Upgraded v0.5 routing block to v0.6.");
      } else if (!content.includes(BLOCK_START) && content.includes(OLD_REFERENCE_LINE)) {
        content = content.replace(OLD_REFERENCE_LINE, ROUTING_BLOCK);
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
      const results = fix(projectRoot);
      printFixResults(results, false);
      for (const f of results.fixed) touchedFiles.push(f.file);
      stageFiles(projectRoot, touchedFiles);
    }
    printPackageManagerHint(projectRoot);
    return;
  }

  const mode = soft ? "soft" : "enforcement";
  console.log(`  Mode: ${mode}`);

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
  if (existsSync(claudeMdPath)) {
    let content = readFileSync(claudeMdPath, "utf8");
    if (isStaleRoutingBlock(content)) {
      // Upgrade v0.5.x block → v0.6 block
      content = replaceRoutingBlock(content);
      writeFileSync(claudeMdPath, content);
      console.log(`  Upgraded v0.5 routing block to v0.6 in ${CLAUDE_MD}`);
    } else if (content.includes(BLOCK_START)) {
      // Already has v0.6 block — skip
    } else if (content.includes(OLD_REFERENCE_LINE)) {
      // Upgrade v0.4.x single-line reference → v0.6 block
      content = content.replace(OLD_REFERENCE_LINE, ROUTING_BLOCK);
      writeFileSync(claudeMdPath, content);
      console.log(`  Upgraded v0.4 reference to routing block in ${CLAUDE_MD}`);
    } else if (!content.includes(REFERENCE_MARKER)) {
      writeFileSync(claudeMdPath, content.trimEnd() + "\n\n" + ROUTING_BLOCK + "\n");
      console.log(`  Added routing block to ${CLAUDE_MD}`);
    }
  } else {
    writeFileSync(claudeMdPath, ROUTING_BLOCK + "\n");
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

    // Inject model frontmatter into any other agents/skills
    const results = fix(projectRoot);
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
