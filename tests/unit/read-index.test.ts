import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Index } from "../../src/dispatcher/dispatch";
import { readIndex } from "../../src/dispatcher/read-index";

const scratch = mkdtempSync(join(tmpdir(), "skills-read-index-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const PATH = join(scratch, "dispatch.json");

const INDEX: Index = {
  harness: "claude-code",
  rules: [
    { name: "unslop", triggers: [{ predicate: "always" }], text: "# unslop" },
    { name: "comment-discipline", triggers: [{ predicate: "file-matches", glob: "**/*.ts" }], text: "# comments", forbid: "comments", inactive: true },
  ],
  profiles: [
    { name: "default", models: [], rules: ["unslop"], skills: [], references: [] },
    { name: "qwen", models: ["qwen3-coder"], rules: [], skills: [], references: [], tools: ["read"] },
  ],
  hub: [],
};

const read = (value: unknown): Index => {
  writeFileSync(PATH, JSON.stringify(value));
  return readIndex(PATH, "claude-code");
};

const refusal = (value: unknown): string => {
  try {
    read(value);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return expect.unreachable(`${JSON.stringify(value)} was read as an index`);
};

describe("reading the dispatch index", () => {
  test("an index generated for this harness reads back whole", () => {
    expect(read(INDEX)).toEqual(INDEX);
  });

  test("anything but an object is not an index", () => {
    expect(refusal([])).toBe(`${PATH} does not hold an index`);
    expect(refusal("index")).toBe(`${PATH} does not hold an index`);
  });

  test("an index generated for another harness names both harnesses", () => {
    expect(refusal({ ...INDEX, harness: "pi" })).toBe(`${PATH} was generated for "pi", and this is claude-code`);
  });

  test("a rule missing a field, or holding one this Dispatcher cannot read, asks for a regeneration", () => {
    const [rule] = INDEX.rules;
    const unrecognised = `${PATH} holds rules this Dispatcher does not recognise: regenerate it`;
    expect(refusal({ ...INDEX, rules: "unslop" })).toBe(unrecognised);
    expect(refusal({ ...INDEX, rules: [null] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, rules: [{ ...rule, text: 7 }] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, rules: [{ ...rule, triggers: { predicate: "always" } }] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, rules: [{ ...rule, forbid: "everything" }] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, rules: [{ ...rule, inactive: false }] })).toBe(unrecognised);
  });

  test("a profile missing a list, or holding a list of anything but names, asks for a regeneration", () => {
    const [profile] = INDEX.profiles;
    const unrecognised = `${PATH} holds profiles this Dispatcher does not recognise: regenerate it`;
    expect(refusal({ ...INDEX, profiles: undefined })).toBe(unrecognised);
    expect(refusal({ ...INDEX, profiles: [{ ...profile, name: 1 }] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, profiles: [{ ...profile, skills: undefined }] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, profiles: [{ ...profile, models: [7] }] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, profiles: [{ ...profile, tools: "read" }] })).toBe(unrecognised);
  });

  test("a Hub body missing its name or its skill path asks for a regeneration", () => {
    const body = { name: "unslop", skill: "library/writing/references/unslop/SKILL.md" };
    const unrecognised = `${PATH} holds Hub bodies this Dispatcher does not recognise: regenerate it`;
    expect(refusal({ ...INDEX, hub: undefined })).toBe(unrecognised);
    expect(refusal({ ...INDEX, hub: [null] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, hub: [{ ...body, name: 7 }] })).toBe(unrecognised);
    expect(refusal({ ...INDEX, hub: [{ ...body, skill: undefined }] })).toBe(unrecognised);
    expect(read({ ...INDEX, hub: [body] })).toEqual({ ...INDEX, hub: [body] });
  });
});
