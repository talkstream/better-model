import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Infer the recommended model and effort based on agent/skill name and description.
 *
 * `profile` is an optional opt-in overlay that adds domain-specific keywords on
 * top of the base tiers. Currently supported: `"blockchain"` (Solidity + TON).
 * Profile keywords are ALWAYS additive — they never demote an existing tier;
 * they only catch agents the base keyword set would route to default Sonnet.
 *
 * @param {string} name
 * @param {string} description
 * @param {string} [profile] — optional profile overlay; `"blockchain"` supported
 * @returns {{ model: string, effort?: string, reason: string }} effort omitted when model is haiku (Haiku 4.5 does not support effort)
 */
export function inferModel(name, description, profile) {
  const text = `${name} ${description}`.toLowerCase();

  // Tier 1 — Haiku (no effort field — Haiku 4.5 does not support the effort parameter
  // per Anthropic effort docs: https://platform.claude.com/docs/en/build-with-claude/effort)
  const haiku = ["explore", "search", "scan", "grep", "find", "discover", "verify", "health", "check", "status", "monitor"];
  for (const kw of haiku) {
    if (text.includes(kw)) {
      return { model: "haiku", reason: `keyword "${kw}" → Tier 1 (search/verify, no effort on Haiku)` };
    }
  }

  // Tier 3 — Opus max (frontier reasoning: architecture, security, novel algorithms, ultra-planning)
  // "ultraplan" added for the Anthropic cloud planning feature (Code with Claude 2026) —
  // architectural planning warrants max effort.
  const opusMax = ["architect", "security", "novel", "algorithm", "ultraplan"];
  for (const kw of opusMax) {
    if (text.includes(kw)) {
      return { model: "opus", effort: "max", reason: `keyword "${kw}" → Tier 3 max (frontier reasoning)` };
    }
  }

  // Tier 3 — Opus xhigh (agentic coding: code review, migrations, audits, orchestration, advisor)
  // xhigh is Anthropic's recommended starting point for Opus 4.7 coding/agentic work.
  // Substring/distinct-word notes:
  //   - "migrate" / "migration" / "migrator" — all distinct (letter 'e' vs 'i' vs 'o')
  //   - "orchestrate" / "orchestrator" — distinct (final 'e' vs 'or'), list both
  //   - "orchestrate" subsumes "orchestration" by substring
  //   - "review" subsumes "ultrareview" by substring
  //   - "advisor" covers the Code-with-Claude-2026 "Advisor strategy" pattern
  //     (smaller model calls a frontier model for guidance)
  const opusXhigh = ["audit", "migrate", "migration", "migrator", "review", "orchestrate", "orchestrator", "advisor"];
  for (const kw of opusXhigh) {
    if (text.includes(kw)) {
      return { model: "opus", effort: "xhigh", reason: `keyword "${kw}" → Tier 3 xhigh (agentic coding)` };
    }
  }

  // Profile overlay — blockchain (Solidity + TON ecosystem). Additive only:
  // checked AFTER Tier 1 Haiku, Tier 3 max, and Tier 3 xhigh base — so search
  // verbs, architectural keywords, and audit/migrate/review still win their
  // respective tiers. Profile keywords lift the remaining default-Sonnet
  // agents to Opus xhigh, matching the agentic-coding tier.
  //
  // `auditor` is intentionally omitted from this list: it is already covered
  // by the base "audit" substring check above, and inserting it here would
  // never trigger.
  if (profile === "blockchain") {
    // Distinctive blockchain vocabulary — substring match is safe (low FP risk
    // against general English / general coding).
    const blockchainSubstring = ["solidity", "evm", "slither", "mythril", "toncoin", "jetton", "tlb"];
    for (const kw of blockchainSubstring) {
      if (text.includes(kw)) {
        return { model: "opus", effort: "xhigh", reason: `keyword "${kw}" → Tier 3 xhigh (blockchain profile)` };
      }
    }
    // Short keywords that substring-match common English words: "func" inside
    // "function", "tact" inside "tactic"/"contact", "fift" inside "fifth",
    // "contract" inside "contractual"/"subcontract". Word-boundary regex
    // (non-alphanumeric on both sides) avoids these false positives.
    const blockchainWordBoundary = ["func", "tact", "fift", "contract"];
    for (const kw of blockchainWordBoundary) {
      const re = new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, "i");
      if (re.test(text)) {
        return { model: "opus", effort: "xhigh", reason: `keyword "${kw}" → Tier 3 xhigh (blockchain profile)` };
      }
    }
  }

  // Tier 2 — Sonnet (default + specific keywords)
  const sonnetHigh = ["lint", "debug", "investigate", "diagnose"];
  for (const kw of sonnetHigh) {
    if (text.includes(kw)) {
      return { model: "sonnet", effort: "high", reason: `keyword "${kw}" → Tier 2 (needs rigor)` };
    }
  }

  const sonnetMedium = ["test", "format", "deploy", "build", "generate", "refactor", "pipeline"];
  for (const kw of sonnetMedium) {
    if (text.includes(kw)) {
      return { model: "sonnet", effort: "medium", reason: `keyword "${kw}" → Tier 2 (standard work)` };
    }
  }

  // Default
  return { model: "sonnet", effort: "medium", reason: "no specific keyword → safe default (Tier 2)" };
}

/**
 * Extract frontmatter fields from markdown content.
 * @param {string} content
 * @returns {{ fields: Record<string, string>, body: string, hasFrontmatter: boolean }}
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: content, hasFrontmatter: false };

  const fields = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (value) fields[key] = value;
    }
  }
  return { fields, body: match[2], hasFrontmatter: true };
}

/**
 * Safely inject a field into frontmatter without disrupting existing content.
 * Uses string insertion, not full YAML re-serialization.
 * @param {string} content
 * @param {string} field
 * @param {string} value
 * @returns {string}
 */
export function injectFrontmatterField(content, field, value) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (fmMatch) {
    // Check if field already exists
    const fieldRegex = new RegExp(`^${field}:`, "m");
    if (fieldRegex.test(fmMatch[2])) return content;
    // Insert before closing ---
    return content.replace(fmMatch[3], `\n${field}: ${value}${fmMatch[3]}`);
  }
  // No frontmatter — add minimal one
  return `---\n${field}: ${value}\n---\n${content}`;
}

/**
 * Fix agents and skills by injecting model (and optionally effort) frontmatter.
 *
 * `profile` activates a domain-specific keyword overlay in `inferModel` so
 * blockchain-vocabulary agents route to Opus xhigh in blockchain-profile
 * projects. Caller is expected to pass the project's active profile (from
 * the routing block in CLAUDE.md); `fix` does not parse CLAUDE.md itself.
 *
 * @param {string} projectRoot
 * @param {{ dryRun?: boolean, effort?: boolean, profile?: string }} options
 * @returns {{ fixed: Array<{file: string, model: string, effort?: string, reason: string}>, skipped: Array<{file: string, reason: string}> }}
 */
export function fix(projectRoot, options = {}) {
  const { dryRun = false, effort = true, profile } = options;
  const fixed = [];
  const skipped = [];

  // Fix agents
  const agentsDir = join(projectRoot, ".claude", "agents");
  if (existsSync(agentsDir)) {
    const agents = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    for (const file of agents) {
      const filePath = join(agentsDir, file);
      const content = readFileSync(filePath, "utf8");
      const { fields } = parseFrontmatter(content);

      if (fields.model) {
        skipped.push({ file: `.claude/agents/${file}`, reason: `already has model: ${fields.model}` });
        continue;
      }

      const name = file.replace(".md", "");
      const desc = fields.description || "";
      const inferred = inferModel(name, desc, profile);

      let updated = injectFrontmatterField(content, "model", inferred.model);
      // Guard `inferred.effort` is mandatory: when inferModel returns no effort
      // (Haiku tier), injecting `undefined` would write literal "effort: undefined"
      // into the file. Only inject when an effort value is actually available.
      if (effort && inferred.effort && !fields.effort) {
        updated = injectFrontmatterField(updated, "effort", inferred.effort);
      }

      if (!dryRun) {
        writeFileSync(filePath, updated);
      }

      fixed.push({
        file: `.claude/agents/${file}`,
        model: inferred.model,
        effort: effort ? inferred.effort : undefined,
        reason: inferred.reason,
      });
    }
  }

  // Fix skills
  const skillsDir = join(projectRoot, ".claude", "skills");
  if (existsSync(skillsDir)) {
    const skills = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isSymbolicLink());

    for (const dir of skills) {
      const skillFile = join(skillsDir, dir.name, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const content = readFileSync(skillFile, "utf8");
      const { fields } = parseFrontmatter(content);

      // If skill delegates to an agent with model set, skip
      if (fields.agent) {
        const agentFile = join(agentsDir, `${fields.agent}.md`);
        if (existsSync(agentFile)) {
          const agentContent = readFileSync(agentFile, "utf8");
          const agentFm = parseFrontmatter(agentContent);
          if (agentFm.fields.model) {
            skipped.push({
              file: `.claude/skills/${dir.name}/SKILL.md`,
              reason: `delegates to agent "${fields.agent}" which has model: ${agentFm.fields.model}`,
            });
            continue;
          }
        }
      }

      if (fields.model) {
        skipped.push({ file: `.claude/skills/${dir.name}/SKILL.md`, reason: `already has model: ${fields.model}` });
        continue;
      }

      const desc = fields.description || "";
      const inferred = inferModel(dir.name, desc, profile);

      let updated = injectFrontmatterField(content, "model", inferred.model);
      // Same guard as agents branch — never inject "effort: undefined" for Haiku skills.
      if (effort && inferred.effort && !fields.effort) {
        updated = injectFrontmatterField(updated, "effort", inferred.effort);
      }

      if (!dryRun) {
        writeFileSync(skillFile, updated);
      }

      fixed.push({
        file: `.claude/skills/${dir.name}/SKILL.md`,
        model: inferred.model,
        effort: effort ? inferred.effort : undefined,
        reason: inferred.reason,
      });
    }
  }

  return { fixed, skipped };
}

/**
 * Print fix results to console.
 * @param {{ fixed: Array, skipped: Array }} results
 * @param {boolean} dryRun
 */
export function printFixResults(results, dryRun) {
  const verb = dryRun ? "Would fix" : "Fixed";

  if (results.fixed.length > 0) {
    console.log(`\n  ${verb}:`);
    for (const f of results.fixed) {
      const effortStr = f.effort ? `, effort=${f.effort}` : "";
      console.log(`    + ${f.file} → model=${f.model}${effortStr} (${f.reason})`);
    }
  }

  if (results.skipped.length > 0) {
    console.log(`\n  Skipped:`);
    for (const s of results.skipped) {
      console.log(`    ✓ ${s.file} — ${s.reason}`);
    }
  }

  if (results.fixed.length === 0 && results.skipped.length === 0) {
    console.log("\n  No agents or skills found to fix.");
  }

  console.log("");
  if (dryRun && results.fixed.length > 0) {
    console.log(`  Run with --fix to apply these changes.`);
  } else if (results.fixed.length > 0) {
    console.log(`  ✓ ${results.fixed.length} file(s) updated with model frontmatter.`);
  }
}
