import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSkillsSettings, SETTINGS_FILE } from "./project-settings";

export const PROJECT_FILE = "package.json";

export const DECLARATIONS = ["effect"] as const;
export type Declaration = (typeof DECLARATIONS)[number];

export type Project =
  | { path: string; declares: Declaration[]; on: string[]; off: string[] }
  | { path: string; unreadable: string };

const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const DEPENDENCIES = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

function effectDeclared(parsed: Record<string, unknown>): boolean | string {
  for (const section of DEPENDENCIES) {
    const named = parsed[section];
    if (named === undefined) continue;
    if (!isRecord(named)) return `holds ${section} that is not an object`;
    if ("effect" in named) return true;
  }
  return false;
}

export function decodeProject(path: string, text: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { path, unreadable: `is not JSON: ${because(e)}` };
  }
  if (!isRecord(parsed)) return { path, unreadable: "does not hold an object" };
  if ("skills" in parsed) return { path, unreadable: `sets skills. Remove the skills key and move rules to ${SETTINGS_FILE}` };
  const effect = effectDeclared(parsed);
  if (typeof effect === "string") return { path, unreadable: effect };
  return { path, declares: effect ? ["effect"] : [], on: [], off: [] };
}

function gitRoot(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

const isAbsent = (e: unknown): boolean => e instanceof Error && "code" in e && e.code === "ENOENT";

function readManifest(root: string): Project | undefined {
  const path = join(root, PROJECT_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return isAbsent(e) ? undefined : { path, unreadable: `could not be read: ${because(e)}` };
  }
  return decodeProject(path, text);
}

export function readProject(cwd: string): Project | undefined {
  const root = gitRoot(cwd);
  if (root === undefined) return undefined;
  const manifest = readManifest(root);
  if (manifest && "unreadable" in manifest) return manifest;
  const read = readSkillsSettings(root);
  if (read === undefined) return manifest;
  if ("unreadable" in read) return read;
  return { path: read.path, declares: manifest?.declares ?? [], ...read.settings.rules };
}
