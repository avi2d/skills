import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function buildId(dir: string): string {
  try {
    const files = readdirSync(dir).sort();
    const hash = createHash("sha256");
    for (const file of files) {
      hash.update(file);
      hash.update(readFileSync(join(dir, file)));
    }
    return hash.digest("hex").slice(0, 12);
  } catch (e) {
    return `unreadable(${because(e)})`;
  }
}

export const HOME = process.env.HOME ?? homedir();

export const model = (ctx: { model: { provider: string; id: string } | undefined }): { model?: string } =>
  ctx.model ? { model: `${ctx.model.provider}/${ctx.model.id}` } : {};

export function onDisk(path: string, cwd: string): string {
  const bare = path.startsWith("@") ? path.slice(1) : path;
  return resolve(cwd, bare === "~" || bare.startsWith("~/") ? join(HOME, bare.slice(1)) : bare);
}

export const mintName = (): string => `unnamed-${Math.random().toString(16).slice(2, 10)}`;
