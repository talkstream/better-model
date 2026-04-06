import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getInstallStatus, CLAUDE_MD, TEMPLATE_FILE, REFERENCE_MARKER } from "./detect.js";
import { fix, printFixResults } from "./fix.js";
import { gitAdd, isGitRepo } from "./git.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_SRC = join(__dirname, "..", "templates", TEMPLATE_FILE);

const REFERENCE_LINE = `\n→ **[Model Selection Guide](docs/${TEMPLATE_FILE})** — when to use Opus/Sonnet/Haiku and effort levels\n`;

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
    if (!soft) {
      console.log("\n  Running enforcement check on agents/skills...");
      const results = fix(projectRoot);
      printFixResults(results, false);
      for (const f of results.fixed) touchedFiles.push(f.file);
      stageFiles(projectRoot, touchedFiles);
    }
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

  // Add reference to CLAUDE.md
  const claudeMdPath = join(projectRoot, CLAUDE_MD);
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, "utf8");
    if (!content.includes(REFERENCE_MARKER)) {
      writeFileSync(claudeMdPath, content.trimEnd() + "\n" + REFERENCE_LINE);
      console.log(`  Added reference to ${CLAUDE_MD}`);
    }
  } else {
    writeFileSync(claudeMdPath, REFERENCE_LINE.trimStart());
    console.log(`  Created ${CLAUDE_MD} with reference`);
  }
  touchedFiles.push(CLAUDE_MD);

  // Enforcement mode: inject model frontmatter into agents/skills
  if (!soft) {
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
