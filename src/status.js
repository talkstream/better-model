import { getInstallStatus } from "./detect.js";

/**
 * Print the current installation status of better-model.
 * @param {string} projectRoot
 */
export function status(projectRoot) {
  const s = getInstallStatus(projectRoot);

  if (s.installed) {
    console.log("✓ better-model is installed.");
    console.log(`  Template: ${s.templatePath}`);
    console.log(`  Reference: ${s.claudeMdPath}`);
  } else {
    console.log("✗ better-model is not installed.");
    if (s.templatePath) {
      console.log(`  Template found: ${s.templatePath}`);
    }
    if (s.claudeMdPath) {
      console.log(`  CLAUDE.md found but missing reference`);
    }
    console.log("\n  Run 'npx better-model init' to install.");
  }
}
