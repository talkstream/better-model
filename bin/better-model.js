#!/usr/bin/env node

import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const command = args[0];
const flags = new Set(args.slice(1));

function printVersion() {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
  console.log(`better-model v${pkg.version}`);
}

function printHelp() {
  console.log(`
better-model — Evidence-based model & effort selection for Claude Code

Usage:
  npx better-model <command> [options]

Commands:
  init             Install with enforcement (default) — injects model
                   frontmatter into .claude/agents/ and skills/
  init --soft      Install soft mode — decision matrix as reference only
  reset            Remove better-model and restore defaults
  status           Show current installation status
  audit            Check .claude/agents/ and skills for missing model settings
  audit --fix      Auto-inject model frontmatter into agents and skills

Options:
  --help           Show this help message
  --version        Show version number

Examples:
  npx better-model init          # Enforcement mode (default)
  npx better-model init --soft   # Soft mode — .md reference only
  npx better-model audit         # Report missing model settings
  npx better-model audit --fix   # Fix missing model settings
  npx better-model reset         # Remove and restore defaults

Learn more: https://github.com/talkstream/better-model
`);
}

async function main() {
  const projectRoot = resolve(".");

  switch (command) {
    case "init": {
      const { init } = await import("../src/init.js");
      init(projectRoot, { soft: flags.has("--soft") });
      break;
    }
    case "reset": {
      const { reset } = await import("../src/reset.js");
      reset(projectRoot);
      break;
    }
    case "status": {
      const { status } = await import("../src/status.js");
      status(projectRoot);
      break;
    }
    case "audit": {
      const { audit } = await import("../src/audit.js");
      audit(projectRoot, { fix: flags.has("--fix") });
      break;
    }
    case "--version":
    case "-v":
      printVersion();
      break;
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'npx better-model --help' for usage.");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
