import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PROJECT_FILE = "package.json";

export const DECLARATIONS = ["effect"] as const;
export type Declaration = (typeof DECLARATIONS)[number];

export type Project =
  | { path: string; declares: Declaration[]; on: string[]; off: string[] }
  | { path: string; unreadable: string };

type Declared = { declares: Declaration[]; on: string[]; off: string[] };

const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNames = (value: unknown): value is string[] => Array.isArray(value) && value.every((name) => typeof name === "string");

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

function switches(skills: unknown): { on: string[]; off: string[] } | string {
  if (skills === undefined) return { on: [], off: [] };
  if (!isRecord(skills)) return "holds skills that is not an object";
  const { rules } = skills;
  if (rules === undefined) return { on: [], off: [] };
  if (!isRecord(rules)) return "holds skills.rules that is not an object";
  const { on = [], off = [] } = rules;
  if (!isNames(on)) return "holds skills.rules.on that is not a list of Rule names";
  if (!isNames(off)) return "holds skills.rules.off that is not a list of Rule names";
  const both = on.filter((name) => off.includes(name));
  if (both.length > 0) return `switches ${both.join(", ")} both on and off`;
  return { on, off };
}

function declared(parsed: unknown): Declared | string {
  if (!isRecord(parsed)) return "does not hold an object";
  const effect = effectDeclared(parsed);
  if (typeof effect === "string") return effect;
  const switched = switches(parsed.skills);
  if (typeof switched === "string") return switched;
  return { declares: effect ? ["effect"] : [], ...switched };
}

export function decodeProject(path: string, text: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { path, unreadable: `is not JSON: ${because(e)}` };
  }
  const read = declared(parsed);
  return typeof read === "string" ? { path, unreadable: read } : { path, ...read };
}

function gitRoot(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

const isAbsent = (e: unknown): boolean => e instanceof Error && "code" in e && e.code === "ENOENT";

export function readProject(cwd: string): Project | undefined {
  const root = gitRoot(cwd);
  if (root === undefined) return undefined;
  const path = join(root, PROJECT_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return isAbsent(e) ? undefined : { path, unreadable: `could not be read: ${because(e)}` };
  }
  return decodeProject(path, text);
}
