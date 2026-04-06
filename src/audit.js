import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getInstallStatus } from "./detect.js";
import { fix, printFixResults } from "./fix.js";
import { gitAdd } from "./git.js";

/**
 * Scan .claude/agents/ and .claude/skills/ for missing model/effort frontmatter.
 * @param {string} projectRoot
 * @param {{ fix: boolean }} options
 */
export function audit(projectRoot, options = {}) {
  if (options.fix) {
    const status = getInstallStatus(projectRoot);
    if (!status.installed) {
      console.log("✗ better-model is not installed. Run 'npx better-model init' first.");
      return;
    }
    console.log("Fixing .claude/ agents & skills — injecting model frontmatter...\n");
    const results = fix(projectRoot);
    printFixResults(results, false);

    // Auto git-add fixed files
    const files = results.fixed.map((f) => f.file);
    const staged = gitAdd(projectRoot, files);
    if (staged.length > 0) {
      console.log(`  Staged ${staged.length} file(s) in git:`);
      for (const f of staged) console.log(`    + ${f}`);
    }
    return;
  }
  const status = getInstallStatus(projectRoot);
  if (!status.installed) {
    console.log("✗ better-model is not installed. Run 'npx better-model init' first.");
    return;
  }

  console.log("Auditing .claude/ for model & effort configuration...\n");

  let issues = 0;

  // Scan agents
  const agentsDir = join(projectRoot, ".claude", "agents");
  if (existsSync(agentsDir)) {
    const agents = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    if (agents.length > 0) {
      console.log("  Agents:");
      for (const file of agents) {
        const content = readFileSync(join(agentsDir, file), "utf8");
        const frontmatter = extractFrontmatter(content);
        const name = file.replace(".md", "");
        const model = frontmatter.model || null;
        const effort = frontmatter.effort || null;

        if (model && effort) {
          console.log(`    ✓ ${name}: model=${model}, effort=${effort}`);
        } else if (model) {
          console.log(`    ~ ${name}: model=${model}, effort=missing`);
          issues++;
        } else if (effort) {
          console.log(`    ~ ${name}: model=missing, effort=${effort}`);
          issues++;
        } else {
          console.log(`    ✗ ${name}: no model or effort set (inherits session default)`);
          issues++;
        }
      }
    }
  } else {
    console.log("  No .claude/agents/ directory found.");
  }

  // Scan skills
  const skillsDir = join(projectRoot, ".claude", "skills");
  if (existsSync(skillsDir)) {
    const skills = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isSymbolicLink());
    if (skills.length > 0) {
      console.log("\n  Skills:");
      for (const dir of skills) {
        const skillFile = join(skillsDir, dir.name, "SKILL.md");
        if (!existsSync(skillFile)) continue;
        const content = readFileSync(skillFile, "utf8");
        const frontmatter = extractFrontmatter(content);
        const model = frontmatter.model || null;
        const effort = frontmatter.effort || null;

        if (model) {
          console.log(`    ✓ ${dir.name}: model=${model}${effort ? `, effort=${effort}` : ""}`);
        } else {
          console.log(`    ~ ${dir.name}: no model set (uses agent default or session model)`);
        }
      }
    }
  } else {
    console.log("\n  No .claude/skills/ directory found.");
  }

  // Summary
  console.log("");
  if (issues === 0) {
    console.log("✓ All agents have model configuration.");
  } else {
    console.log(`⚠ ${issues} agent(s) missing model or effort settings.`);
    console.log("  Run 'npx better-model audit --fix' to auto-inject model frontmatter.");
  }
}

/**
 * Extract YAML frontmatter fields from a markdown file.
 * @param {string} content
 * @returns {Record<string, string>}
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (value) result[key] = value;
    }
  }
  return result;
}
