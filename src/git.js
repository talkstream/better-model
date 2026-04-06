import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Check if the project root is inside a git repository.
 * @param {string} projectRoot
 * @returns {boolean}
 */
export function isGitRepo(projectRoot) {
  return existsSync(join(projectRoot, ".git"));
}

/**
 * Stage specific files in git. Silently skips if not a git repo or if git fails.
 * @param {string} projectRoot
 * @param {string[]} files — paths relative to projectRoot
 * @returns {string[]} — files that were successfully staged
 */
export function gitAdd(projectRoot, files) {
  if (!isGitRepo(projectRoot)) return [];

  const staged = [];
  for (const file of files) {
    const abs = join(projectRoot, file);
    if (!existsSync(abs)) continue;
    try {
      execFileSync("git", ["add", "--", file], { cwd: projectRoot, stdio: "ignore" });
      staged.push(file);
    } catch {
      // git add failed — skip silently (file might be gitignored)
    }
  }
  return staged;
}
