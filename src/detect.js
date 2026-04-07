import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AGENT_MARKER } from "./agents.js";

const DOCS_CANDIDATES = ["docs", "doc", "documentation"];
const CLAUDE_MD = "CLAUDE.md";
const TEMPLATE_FILE = "BETTER-MODEL.md";
const REFERENCE_MARKER = "BETTER-MODEL.md";

/**
 * Find the first existing documentation directory, or default to "docs".
 * @param {string} projectRoot
 * @returns {string} Relative directory name (e.g. "docs")
 */
export function findDocsDir(projectRoot) {
  for (const candidate of DOCS_CANDIDATES) {
    if (existsSync(join(projectRoot, candidate))) {
      return candidate;
    }
  }
  return "docs";
}

/**
 * Return the path to CLAUDE.md relative to projectRoot, or null if absent.
 * @param {string} projectRoot
 * @returns {string|null}
 */
export function findClaudeMd(projectRoot) {
  const path = join(projectRoot, CLAUDE_MD);
  return existsSync(path) ? CLAUDE_MD : null;
}

/**
 * Check whether better-model is already installed in the project.
 * @param {string} projectRoot
 * @returns {{ installed: boolean, templatePath: string|null, claudeMdPath: string|null, docsDir: string }}
 */
export function getInstallStatus(projectRoot) {
  const docsDir = findDocsDir(projectRoot);
  const templatePath = join(docsDir, TEMPLATE_FILE);
  const templateExists = existsSync(join(projectRoot, templatePath));

  const claudeMdRel = findClaudeMd(projectRoot);
  let hasReference = false;
  if (claudeMdRel) {
    const content = readFileSync(join(projectRoot, claudeMdRel), "utf8");
    hasReference = content.includes(REFERENCE_MARKER);
  }

  return {
    installed: templateExists && hasReference,
    templatePath: templateExists ? templatePath : null,
    claudeMdPath: claudeMdRel,
    docsDir,
  };
}

/**
 * List better-model agents installed in the project (identified by marker).
 * @param {string} projectRoot
 * @returns {string[]} Filenames of installed better-model agents
 */
export function getInstalledAgents(projectRoot) {
  const agentsDir = join(projectRoot, ".claude", "agents");
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => {
      const content = readFileSync(join(agentsDir, f), "utf8");
      return content.includes(AGENT_MARKER);
    });
}

export { CLAUDE_MD, TEMPLATE_FILE, REFERENCE_MARKER };
