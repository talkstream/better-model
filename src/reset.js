import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getInstallStatus, CLAUDE_MD, TEMPLATE_FILE, REFERENCE_MARKER } from "./detect.js";
import { removeAgents } from "./agents.js";
import { BLOCK_START, BLOCK_END } from "./init.js";

/**
 * Remove better-model from the target project, restoring defaults.
 * @param {string} projectRoot
 */
export function reset(projectRoot) {
  const status = getInstallStatus(projectRoot);

  if (!status.installed && !status.templatePath) {
    console.log("✗ better-model is not installed in this project.");
    return;
  }

  // Remove better-model agents
  const agentResult = removeAgents(projectRoot);
  if (agentResult.removed.length > 0) {
    for (const f of agentResult.removed) {
      console.log(`  Removed agent .claude/agents/${f}`);
    }
  }

  // Remove template file
  if (status.templatePath) {
    const templateAbs = join(projectRoot, status.templatePath);
    if (existsSync(templateAbs)) {
      unlinkSync(templateAbs);
      console.log(`  Removed ${status.templatePath}`);
    }

    // Remove docs dir if empty
    const docsAbs = join(projectRoot, status.docsDir);
    if (existsSync(docsAbs)) {
      const remaining = readdirSync(docsAbs);
      if (remaining.length === 0) {
        rmSync(docsAbs, { recursive: true });
        console.log(`  Removed empty ${status.docsDir}/`);
      }
    }
  }

  // Remove routing block (or legacy reference line) from CLAUDE.md
  const claudeMdPath = join(projectRoot, CLAUDE_MD);
  if (existsSync(claudeMdPath)) {
    let content = readFileSync(claudeMdPath, "utf8");
    let changed = false;

    // v0.5.0 multi-line block
    const blockStart = content.indexOf(BLOCK_START);
    const blockEnd = content.indexOf(BLOCK_END);
    if (blockStart !== -1 && blockEnd !== -1) {
      const before = content.slice(0, blockStart);
      const after = content.slice(blockEnd + BLOCK_END.length);
      content = (before + after).replace(/\n{3,}/g, "\n\n").trim();
      changed = true;
    } else if (content.includes(REFERENCE_MARKER)) {
      // v0.4.0 fallback: single-line reference
      const lines = content.split("\n");
      content = lines.filter((line) => !line.includes(REFERENCE_MARKER)).join("\n").trim();
      changed = true;
    }

    if (changed) {
      if (content.length === 0) {
        unlinkSync(claudeMdPath);
        console.log(`  Removed empty ${CLAUDE_MD}`);
      } else {
        writeFileSync(claudeMdPath, content + "\n");
        console.log(`  Removed routing block from ${CLAUDE_MD}`);
      }
    }
  }

  console.log("\n✓ better-model removed. Default settings restored.");
}
