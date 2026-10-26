import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = new URL("../../../", import.meta.url).pathname;

// Found rather than listed, since a nested config left out of a fixture would make it lint as the tree does not.
// Without .gitignore oxlint walks the linked node_modules and loads a second copy of the plugin its config names.
const lintConfigs = Bun.spawnSync(["git", "ls-files", "-z", "--", "*.gitignore", "*oxlintrc*.json", "*oxlint.config.ts", "*tsconfig*.json"], { cwd: repo })
  .stdout.toString()
  .split("\0")
  .filter(Boolean);

export const inLintScratch = (prefix: string, sources: readonly string[], check: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    for (const entry of [...lintConfigs, ...sources]) cpSync(`${repo}${entry}`, join(dir, entry), { recursive: true });
    symlinkSync(`${repo}node_modules`, join(dir, "node_modules"));
    check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
