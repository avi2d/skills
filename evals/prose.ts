import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { SKILL_FILE } from "../src/bodies/bodies";
import type { Prose } from "../src/eval/eval-sweeps";

// A path HEAD does not hold, and a git that failed, both leave no committed text to compare against.
function committedText(repo: string, file: string): string | undefined {
  const shown = spawnSync("git", ["show", `HEAD:${file}`], { cwd: repo, encoding: "utf8" });
  return shown.status === 0 ? shown.stdout : undefined;
}

export function proseOf(repo: string, dirs: readonly string[]): Prose {
  const files = dirs.map((dir) => `${dir}/${SKILL_FILE}`);
  const read = files.map((file) => {
    const text = readFileSync(`${repo}${file}`, "utf8");
    return { file, hash: createHash("sha256").update(text).digest("hex"), uncommitted: committedText(repo, file) !== text };
  });
  return { files: Object.fromEntries(read.map(({ file, hash }) => [file, hash])), uncommitted: read.some((one) => one.uncommitted) };
}
