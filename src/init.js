import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getInstallStatus, CLAUDE_MD, TEMPLATE_FILE, REFERENCE_MARKER } from "./detect.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_SRC = join(__dirname, "..", "templates", TEMPLATE_FILE);

const REFERENCE_LINE = `\n→ **[Model Selection Guide](docs/${TEMPLATE_FILE})** — when to use Opus/Sonnet/Haiku and effort levels\n`;

/**
 * Install better-model into the target project.
 * @param {string} projectRoot
 */
export function init(projectRoot) {
  const status = getInstallStatus(projectRoot);

  if (status.installed) {
    console.log("✓ better-model is already installed.");
    console.log(`  Template: ${status.templatePath}`);
    console.log(`  Reference in: ${status.claudeMdPath}`);
    return;
  }

  // Ensure docs directory exists
  const docsDir = status.docsDir;
  const docsDirAbs = join(projectRoot, docsDir);
  if (!existsSync(docsDirAbs)) {
    mkdirSync(docsDirAbs, { recursive: true });
    console.log(`  Created ${docsDir}/`);
  }

  // Copy template
  const destPath = join(docsDirAbs, TEMPLATE_FILE);
  if (!existsSync(destPath)) {
    copyFileSync(TEMPLATE_SRC, destPath);
    console.log(`  Copied ${docsDir}/${TEMPLATE_FILE}`);
  }

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

  console.log("\n✓ better-model installed successfully.");
  console.log("  Claude Code will now use the decision matrix for model selection.");
}
