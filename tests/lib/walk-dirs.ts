import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const base = realpathSync(tmpdir());

const made: string[] = [];

export const walkDir = (): string => {
  const dir = mkdtempSync(join(base, "skills-walk-"));
  made.push(dir);
  return dir;
};

export const removeWalkDirs = (): void => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
};
