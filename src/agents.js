import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./fix.js";

/** Marker appended to all better-model agent files for safe identification. */
export const AGENT_MARKER = "<!-- installed by better-model \u2014 do not edit this line -->";

const AGENTS_DIR = join(".claude", "agents");

const SONNET_CODER = `---
name: sonnet-coder
description: General-purpose coding agent for implementing features, writing tests, refactoring, and debugging in 1-2 files. Use for any coding subagent task that does not require multi-file architecture (3+ files with behavioral dependencies), security audit, code review, or novel algorithm design.
model: sonnet
effort: medium
---

# Sonnet Coder

Handle this coding task efficiently following existing project patterns.

## Scope
- Feature implementation, bug fixes, code modifications
- Unit and integration test writing
- Refactoring within 1-2 files
- Documentation updates tied to code changes

## Escalation
If the task requires changes across 3+ files with behavioral dependencies,
architecture decisions, security implications, or code review \u2014 stop and report
to the parent agent that this task exceeds sonnet-coder scope.

${AGENT_MARKER}
`;

const HAIKU_EXPLORER = `---
name: haiku-explorer
description: Fast read-only codebase exploration agent for file search, code grep, pattern matching, reading file contents, checking project structure, and git history analysis. Never modifies files.
model: haiku
effort: low
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Haiku Explorer

Search the codebase and report findings. Be fast and concise.

- Find files, functions, patterns, or dependencies as requested
- Report with file paths and line numbers
- Do NOT modify any files
- Keep responses brief \u2014 facts only, no analysis

${AGENT_MARKER}
`;

/** Agent definitions shipped by better-model. */
export const AGENTS = [
  { filename: "sonnet-coder.md", content: SONNET_CODER },
  { filename: "haiku-explorer.md", content: HAIKU_EXPLORER },
];

/**
 * Collect existing agent names from .claude/agents/.
 * @param {string} agentsDir - Absolute path to .claude/agents/
 * @returns {Set<string>} Set of name: values from frontmatter
 */
function existingAgentNames(agentsDir) {
  const names = new Set();
  if (!existsSync(agentsDir)) return names;
  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
    const content = readFileSync(join(agentsDir, file), "utf8");
    const { fields } = parseFrontmatter(content);
    if (fields.name) names.add(fields.name);
  }
  return names;
}

/**
 * Install better-model agents into the project.
 * @param {string} projectRoot
 * @returns {{ installed: string[], skipped: string[] }}
 */
export function installAgents(projectRoot) {
  const agentsDir = join(projectRoot, AGENTS_DIR);
  mkdirSync(agentsDir, { recursive: true });

  const names = existingAgentNames(agentsDir);
  const installed = [];
  const skipped = [];

  for (const agent of AGENTS) {
    const filePath = join(agentsDir, agent.filename);

    if (existsSync(filePath)) {
      skipped.push(agent.filename);
      continue;
    }

    const { fields } = parseFrontmatter(agent.content);
    if (fields.name && names.has(fields.name)) {
      skipped.push(agent.filename);
      continue;
    }

    writeFileSync(filePath, agent.content);
    installed.push(agent.filename);
  }

  return { installed, skipped };
}

/**
 * Remove only better-model agents (identified by marker) from the project.
 * @param {string} projectRoot
 * @returns {{ removed: string[], kept: string[] }}
 */
export function removeAgents(projectRoot) {
  const agentsDir = join(projectRoot, AGENTS_DIR);
  const removed = [];
  const kept = [];

  if (!existsSync(agentsDir)) return { removed, kept };

  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
    const filePath = join(agentsDir, file);
    const content = readFileSync(filePath, "utf8");

    if (content.includes(AGENT_MARKER)) {
      unlinkSync(filePath);
      removed.push(file);
    } else {
      kept.push(file);
    }
  }

  // Remove empty agents directory
  if (existsSync(agentsDir) && readdirSync(agentsDir).length === 0) {
    rmdirSync(agentsDir);
  }

  return { removed, kept };
}
