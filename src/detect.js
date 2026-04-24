import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AGENT_MARKER } from "./agents.js";

const DOCS_CANDIDATES = ["docs", "doc", "documentation"];
const CLAUDE_MD = "CLAUDE.md";
const TEMPLATE_FILE = "BETTER-MODEL.md";
const REFERENCE_MARKER = "BETTER-MODEL.md";

const PM_LOCKFILES = [
  ["pnpm", "pnpm-lock.yaml"],
  ["yarn", "yarn.lock"],
  ["bun", "bun.lockb"],
];
const PM_PACKAGE_MANAGER_PREFIXES = ["pnpm@", "yarn@", "bun@"];

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

/**
 * Detect which package manager the project uses.
 * Checks lockfiles first (strongest signal), then the packageManager field in
 * package.json. Returns null when the project looks like plain npm or when no
 * signal is present.
 * @param {string} projectRoot
 * @returns {"pnpm"|"yarn"|"bun"|null}
 */
export function detectPackageManager(projectRoot) {
  for (const [pm, lockfile] of PM_LOCKFILES) {
    if (existsSync(join(projectRoot, lockfile))) return pm;
  }
  const pkgJsonPath = join(projectRoot, "package.json");
  if (!existsSync(pkgJsonPath)) return null;
  try {
    const { packageManager } = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (typeof packageManager !== "string") return null;
    for (const prefix of PM_PACKAGE_MANAGER_PREFIXES) {
      if (packageManager.startsWith(prefix)) {
        return prefix.slice(0, -1);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export { CLAUDE_MD, TEMPLATE_FILE, REFERENCE_MARKER };
