#!/usr/bin/env node

import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const command = args[0];

function printVersion() {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
  console.log(`better-model v${pkg.version}`);
}

function printHelp() {
  console.log(`
better-model — Evidence-based model & effort selection for Claude Code

Usage:
  npx better-model <command>

Commands:
  init      Install decision matrix into your project
  reset     Remove better-model and restore defaults
  status    Show current installation status

Options:
  --help    Show this help message
  --version Show version number

Examples:
  npx better-model init     # Install in current project
  npx better-model reset    # Remove and restore defaults
  npx better-model status   # Check if installed

Learn more: https://github.com/talkstream/better-model
`);
}

async function main() {
  const projectRoot = resolve(".");

  switch (command) {
    case "init": {
      const { init } = await import("../src/init.js");
      init(projectRoot);
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
