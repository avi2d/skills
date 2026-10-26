import { Effect, type FileSystem } from "effect";
import { kindAndName, type Body } from "./bodies";
import type { IndexedProfile } from "../dispatcher/dispatch";
import { MalformedSelection, type FileFailure } from "../platform/failures";
import { isRecord } from "./fields";
import { attempt } from "../platform/files";

export const SELECTION_PATH = "selection.toml";
const DEFAULT_FIELDS = ["rules", "skills", "references", "tools"] as const;
const PROFILE_FIELDS = ["models", "rules", "tools"] as const;
export type Selection = { profiles: IndexedProfile[]; defaultModels: string[] };

const error = (message: string): MalformedSelection => new MalformedSelection({ message: `${SELECTION_PATH}: ${message}` });

const names = Effect.fnUntraced(function* (given: Record<string, unknown>, where: string, field: string): Effect.fn.Return<string[], MalformedSelection> {
  const value = given[field];
  if (!Array.isArray(value) || value.some((name) => typeof name !== "string")) {
    return yield* error(`${where}.${field} is ${JSON.stringify(value)}, which is not a list of names`);
  }
  const listed = value.filter((name): name is string => typeof name === "string");
  if (new Set(listed).size !== listed.length) return yield* error(`${where}.${field} repeats a name`);
  return listed;
});

type Shared = Pick<IndexedProfile, "skills" | "references">;

const knownFields = Effect.fnUntraced(function* (where: string, value: Record<string, unknown>, known: readonly string[]): Effect.fn.Return<void, MalformedSelection> {
  for (const field of Object.keys(value)) {
    if (known.includes(field)) continue;
    if (field === "skills" || field === "references") {
      return yield* error(`${where}.${field} belongs to profiles.default only: every Profile shares its ${field}, because the shared Hub cannot filter by model`);
    }
    return yield* error(`${where}.${field} is not one of ${known.join(", ")}`);
  }
});

const toolsOf = (value: Record<string, unknown>, where: string): Effect.Effect<{ tools?: string[] }, MalformedSelection> =>
  "tools" in value ? Effect.map(names(value, where, "tools"), (tools) => ({ tools })) : Effect.succeed({});

const parseDefault = Effect.fnUntraced(function* (value: Record<string, unknown>): Effect.fn.Return<IndexedProfile, MalformedSelection> {
  const where = "profiles.default";
  if ("models" in value) return yield* error(`${where} cannot name models`);
  yield* knownFields(where, value, DEFAULT_FIELDS);
  return { name: "default", models: [], rules: yield* names(value, where, "rules"), skills: yield* names(value, where, "skills"), references: yield* names(value, where, "references"), ...(yield* toolsOf(value, where)) };
});

// Additions merge into base order, the way the hand-kept lists stay alphabetical.
const resolveRules = (base: readonly string[], add: readonly string[], drop: readonly string[]): string[] => {
  const resolved = base.filter((rule) => !drop.includes(rule));
  for (const rule of add.toSorted()) {
    const at = resolved.findIndex((listed) => rule < listed);
    resolved.splice(at === -1 ? resolved.length : at, 0, rule);
  }
  return resolved;
};

const deltaLists = Effect.fnUntraced(function* (name: string, value: unknown): Effect.fn.Return<{ add: string[]; drop: string[] }, MalformedSelection> {
  const where = `profiles.${name}.rules`;
  if (Array.isArray(value)) {
    return yield* error(`${where} lists every Rule; name only additions in add and removals in drop`);
  }
  if (!isRecord(value)) return yield* error(`${where} is ${JSON.stringify(value)}, which names neither additions nor removals`);
  for (const field of Object.keys(value)) {
    if (field === "add" || field === "drop") continue;
    return yield* error(`${where}.${field} is not one of add, drop`);
  }
  return { add: "add" in value ? yield* names(value, where, "add") : [], drop: "drop" in value ? yield* names(value, where, "drop") : [] };
});

const deltaAgainst = Effect.fnUntraced(function* (
  name: string,
  add: readonly string[],
  drop: readonly string[],
  base: readonly string[],
): Effect.fn.Return<void, MalformedSelection> {
  const where = `profiles.${name}.rules`;
  for (const rule of add) {
    if (drop.includes(rule)) return yield* error(`${where} names ${rule} in both add and drop`);
    if (base.includes(rule)) return yield* error(`${where} adds ${rule}, which profiles.default.rules already lists`);
  }
  for (const rule of drop) {
    if (!base.includes(rule)) return yield* error(`${where} drops ${rule}, which profiles.default.rules does not list`);
  }
});

const deltaOf = Effect.fnUntraced(function* (
  name: string,
  value: unknown,
  base: readonly string[],
): Effect.fn.Return<{ add: string[]; drop: string[] }, MalformedSelection> {
  const delta = yield* deltaLists(name, value);
  yield* deltaAgainst(name, delta.add, delta.drop, base);
  return delta;
});

const parseProfile = Effect.fnUntraced(function* (
  name: string,
  value: unknown,
  shared: Shared,
  base: readonly string[],
): Effect.fn.Return<IndexedProfile, MalformedSelection> {
  const where = `profiles.${name}`;
  if (!isRecord(value)) return yield* error(`[${where}] is not a table`);
  yield* knownFields(where, value, PROFILE_FIELDS);
  const models = yield* names(value, where, "models");
  if (models.length === 0) return yield* error(`${where}.models is empty`);
  const { add, drop } = yield* deltaOf(name, value["rules"], base);
  return { name, models, rules: resolveRules(base, add, drop), skills: shared.skills, references: shared.references, ...(yield* toolsOf(value, where)) };
});

const defaultModelsOf = Effect.fnUntraced(function* (parsed: Record<string, unknown>, claimed: ReadonlySet<string>): Effect.fn.Return<string[], MalformedSelection> {
  const models = "default_models" in parsed ? yield* names(parsed, "selection", "default_models") : [];
  for (const model of models) {
    if (claimed.has(model)) return yield* error(`${model} is named by a profile and default_models`);
  }
  return models;
});

export const parseSelection = Effect.fnUntraced(function* (text: string): Effect.fn.Return<Selection, MalformedSelection> {
  const parsed = yield* Effect.try({
    try: (): unknown => Bun.TOML.parse(text),
    catch: (cause) => error(`is not readable as TOML: ${cause instanceof Error ? cause.message : String(cause)}`),
  });
  if (!isRecord(parsed) || Object.keys(parsed).some((key) => key !== "profiles" && key !== "default_models")) {
    return yield* error("only [profiles.*] tables and default_models belong here");
  }
  if (!isRecord(parsed.profiles) || !isRecord(parsed.profiles.default)) {
    return yield* error("[profiles.default] is required");
  }
  const defaults = yield* parseDefault(parsed.profiles.default);
  const profiles: IndexedProfile[] = [];
  const claimed = new Set<string>();
  for (const [name, value] of Object.entries(parsed.profiles)) {
    const profile = name === "default" ? defaults : yield* parseProfile(name, value, defaults, defaults.rules);
    for (const model of profile.models) {
      if (claimed.has(model)) return yield* error(`${model} is named by two profiles`);
      claimed.add(model);
    }
    profiles.push(profile);
  }
  return { profiles, defaultModels: yield* defaultModelsOf(parsed, claimed) };
});

export const loadSelection = Effect.fnUntraced(function* (repo: string): Effect.fn.Return<Selection, MalformedSelection | FileFailure, FileSystem.FileSystem> {
  const text = yield* attempt(SELECTION_PATH, (fs) => fs.readFileString(`${repo}${SELECTION_PATH}`));
  return yield* parseSelection(text);
});

export function selected(bodies: readonly Body[], selection: Selection): Body[] {
  const named = new Set(selection.profiles.flatMap((profile) => [...profile.rules.map((name) => `rules/${name}`), ...profile.skills.map((name) => `skills/${name}`), ...profile.references.map((name) => `references/${name}`)]));
  return bodies.filter((body) => named.has(kindAndName(body)));
}

export const dormantRules = (bodies: readonly Body[], chosen: readonly Body[]): Body[] =>
  bodies.filter((body) => body.kind === "rule" && !chosen.includes(body));

const validateNames = Effect.fnUntraced(function* (profile: IndexedProfile, known: ReadonlySet<string>): Effect.fn.Return<void, MalformedSelection> {
  for (const field of ["rules", "skills", "references"] as const) {
    for (const name of profile[field]) {
      if (!known.has(`${field}/${name}`)) return yield* error(`profiles.${profile.name}.${field} names ${name}, which is not a Body in the tree`);
    }
  }
});

const validateTools = Effect.fnUntraced(function* (profile: IndexedProfile): Effect.fn.Return<void, MalformedSelection> {
  if (profile.tools !== undefined && (profile.name === "default" || profile.models.some((model) => !model.startsWith("ollama/")))) {
    return yield* error(`profiles.${profile.name}.tools cannot be filtered by every model this Profile covers`);
  }
});

export const profilesOf = Effect.fnUntraced(function* (bodies: readonly Body[], selection: Selection): Effect.fn.Return<IndexedProfile[], MalformedSelection> {
  const known = new Set(bodies.map(kindAndName));
  for (const profile of selection.profiles) {
    yield* validateNames(profile, known);
    yield* validateTools(profile);
  }
  return selection.profiles;
});
