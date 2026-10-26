import { readFileSync } from "node:fs";
import type { Index, IndexedProfile, IndexedRule } from "./dispatch";
import { isRecord } from "./run-state";
import { isForbid } from "./forbid";
import type { Harness } from "./harness";

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const isIndexedRule = (value: unknown): value is IndexedRule =>
  isRecord(value) &&
  typeof value.name === "string" &&
  typeof value.text === "string" &&
  Array.isArray(value.triggers) &&
  (value.forbid === undefined || isForbid(value.forbid)) &&
  (value.inactive === undefined || value.inactive === true);

const isIndexedProfile = (value: unknown): value is IndexedProfile =>
  isRecord(value) &&
  typeof value.name === "string" &&
  isStrings(value.models) &&
  isStrings(value.rules) &&
  isStrings(value.skills) &&
  isStrings(value.references) &&
  (value.tools === undefined || isStrings(value.tools));

const isHubBody = (value: unknown): value is Index["hub"][number] =>
  isRecord(value) && typeof value.name === "string" && typeof value.skill === "string";

export function readIndex(path: string, expected: Harness): Index {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed)) throw new Error(`${path} does not hold an index`);
  const { harness, rules, profiles, hub } = parsed;
  if (harness !== expected) {
    throw new Error(`${path} was generated for ${JSON.stringify(harness)}, and this is ${expected}`);
  }
  if (!Array.isArray(rules) || !rules.every(isIndexedRule)) {
    throw new Error(`${path} holds rules this Dispatcher does not recognise: regenerate it`);
  }
  if (!Array.isArray(profiles) || !profiles.every(isIndexedProfile)) {
    throw new Error(`${path} holds profiles this Dispatcher does not recognise: regenerate it`);
  }
  if (!Array.isArray(hub) || !hub.every(isHubBody)) {
    throw new Error(`${path} holds Hub bodies this Dispatcher does not recognise: regenerate it`);
  }
  return { harness: expected, rules, profiles, hub };
}
