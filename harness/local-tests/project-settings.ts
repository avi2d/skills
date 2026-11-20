import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SETTINGS_FILE = ".skills.json";

type ReadSettings =
  | {
      path: string;
      settings: { agentTests: Exclude<ReturnType<typeof agentTests>, string>; rules: Exclude<ReturnType<typeof rules>, string> };
      migration?: string;
    }
  | { path: string; unreadable: string };

const LEGACY_KEYS = {
  allowLocal: "blocked",
  testCommands: "commands",
  testScripts: "scripts",
  notTestCommands: "checks",
  evalConfigs: "evalConfigs",
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function object(value: unknown, keys: readonly string[], path = ""): Record<string, unknown> | string {
  if (!isRecord(value)) return path === "" ? "must hold an object" : `${path} must be an object`;
  const wrong = Object.keys(value).find((key) => !keys.includes(key));
  if (wrong !== undefined) return `has an unknown key: ${path === "" ? "" : path + "."}${JSON.stringify(wrong).slice(1, -1)}`;
  return value;
}

function names(value: unknown, key: string): string[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return `${key} must be a list of strings`;
  const list: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") return `${key}[${index}] must be a string`;
    list.push(item);
  }
  return list;
}

function agentTests(value: unknown, legacy: boolean) {
  const path = legacy ? "localTests" : "agentTests";
  const keyOf = (key: keyof typeof LEGACY_KEYS) => legacy ? LEGACY_KEYS[key] : key;
  const keys = legacy ? Object.values(LEGACY_KEYS) : Object.keys(LEGACY_KEYS);
  const read = object(value === undefined ? {} : value, keys, path);
  if (typeof read === "string") return read;
  const allowKey = keyOf("allowLocal");
  const allow = read[allowKey];
  if (allow !== undefined && typeof allow !== "boolean") return `${path}.${allowKey} must be a boolean`;
  const allowLocal = allow !== undefined && (legacy ? !allow : allow);
  const list = (key: Exclude<keyof typeof LEGACY_KEYS, "allowLocal">) => names(read[keyOf(key)], `${path}.${keyOf(key)}`);
  const testCommands = list("testCommands");
  if (typeof testCommands === "string") return testCommands;
  const testScripts = list("testScripts");
  if (typeof testScripts === "string") return testScripts;
  const notTestCommands = list("notTestCommands");
  if (typeof notTestCommands === "string") return notTestCommands;
  const evalConfigs = list("evalConfigs");
  if (typeof evalConfigs === "string") return evalConfigs;
  return { allowLocal, testCommands, testScripts, notTestCommands, evalConfigs };
}

function rules(value: unknown) {
  const read = object(value === undefined ? {} : value, ["on", "off"], "rules");
  if (typeof read === "string") return read;
  const on = names(read.on, "rules.on");
  if (typeof on === "string") return on;
  const off = names(read.off, "rules.off");
  if (typeof off === "string") return off;
  const both = on.filter((name) => off.includes(name));
  if (both.length > 0) return `switches ${both.map((name) => JSON.stringify(name)).join(", ")} both on and off`;
  return { on, off };
}

function decode(path: string, value: unknown): ReadSettings {
  const read = object(value, ["$schema", "agentTests", "localTests", "rules"]);
  if (typeof read === "string") return { path, unreadable: read };
  if (read.$schema !== undefined && typeof read.$schema !== "string") return { path, unreadable: "$schema must be a string" };
  const legacy = read.localTests !== undefined;
  if (legacy && read.agentTests !== undefined) return { path, unreadable: "sets both localTests and agentTests. Use agentTests only" };
  const tests = agentTests(legacy ? read.localTests : read.agentTests, legacy);
  if (typeof tests === "string") return { path, unreadable: tests };
  const switches = rules(read.rules);
  if (typeof switches === "string") return { path, unreadable: switches };
  const settings = { agentTests: tests, rules: switches };
  if (!legacy) return { path, settings };
  const renames = Object.entries(LEGACY_KEYS).map(([key, old]) => `${old} to agentTests.${key}`);
  return { path, settings, migration: `Replace localTests in ${path}: rename ${renames.join(", ")} and invert blocked.` };
}

export function readSkillsSettings(root: string): ReadSettings | undefined {
  const path = join(root, SETTINGS_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    return { path, unreadable: "could not be read" };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { path, unreadable: "is not valid JSON" };
  }
  return decode(path, value);
}
