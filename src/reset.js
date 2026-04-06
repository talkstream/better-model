import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { getInstallStatus, CLAUDE_MD, TEMPLATE_FILE, REFERENCE_MARKER } from "./detect.js";

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
        rmdirSync(docsAbs);
        console.log(`  Removed empty ${status.docsDir}/`);
      }
    }
  }

  // Remove reference from CLAUDE.md
  const claudeMdPath = join(projectRoot, CLAUDE_MD);
  if (existsSync(claudeMdPath)) {
    let content = readFileSync(claudeMdPath, "utf8");
    if (content.includes(REFERENCE_MARKER)) {
      // Remove lines containing the reference marker
      const lines = content.split("\n");
      const filtered = lines.filter((line) => !line.includes(REFERENCE_MARKER));
      const cleaned = filtered.join("\n").trim();

      if (cleaned.length === 0) {
        unlinkSync(claudeMdPath);
        console.log(`  Removed empty ${CLAUDE_MD}`);
      } else {
        writeFileSync(claudeMdPath, cleaned + "\n");
        console.log(`  Removed reference from ${CLAUDE_MD}`);
      }
    }
  }

  console.log("\n✓ better-model removed. Default settings restored.");
}
