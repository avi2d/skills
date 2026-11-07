import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judged, reads, type Change, type Replacement, type Verdict } from "../../src/dispatcher/forbid";
import { LINT_SECONDS } from "../../src/dispatcher/types";

const repo = new URL("../../", import.meta.url).pathname;

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// Each judgement spawns oxlint and tsgolint, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(60_000);

const TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true, module: "preserve", target: "esnext", moduleResolution: "bundler", noEmit: true },
  include: ["src"],
});

const project = (files: Record<string, string> = {}, linked = true): string => {
  const dir = mkdtempSync(join(tmpdir(), "skills-types-test-"));
  roots.push(dir);
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  if (linked) symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
};

const standing = (root: string, path: string, before?: string): Change["before"] => ({
  onDisk: join(root, path),
  text: () => before,
  inRepository: () => path,
});

const written = (root: string, path: string, content: string): Verdict =>
  judged("types", "claude-code", { path: join(root, path), before: standing(root, path), content });

const edited = (root: string, path: string, before: string, edits: readonly Replacement[]): Verdict =>
  judged("types", "claude-code", { path: join(root, path), before: standing(root, path, before), edits });

const refusals = (verdict: Verdict): string[] => {
  if ("unread" in verdict) throw new Error(`the write went unread: ${verdict.unread}`);
  return verdict.refusals;
};

const SCHEMA = 'import { Schema } from "effect";\nexport const User = Schema.Struct({ id: Schema.String, age: Schema.Number });\n';

describe("a schema twin", () => {
  test("a type repeating a schema's fields on a line the write adds is refused, saying to derive it, not let through as a plain declaration", () => {
    const root = project();
    const [refused, ...rest] = refusals(written(root, "src/user.ts", `${SCHEMA}export type UserShape = { id: string; age: number };\n`));
    expect(rest).toEqual([]);
    expect(refused).toStartWith("src/user.ts:3 `data-shape/schema-twin`: ");
    expect(refused).toEndWith("Derive it as `typeof User.Type` instead of writing both.");
  });

  test("a type derived from the schema is let through, not refused as a twin", () => {
    const root = project();
    expect(refusals(written(root, "src/user.ts", `${SCHEMA}export type UserShape = typeof User.Type;\n`))).toEqual([]);
  });
});

describe("a type assertion", () => {
  test("asserting outside data a type is refused, saying to parse it, not let through because the assertion compiles", () => {
    const root = project();
    const source = [
      "type Config = { port: number };",
      "export function load(raw: string): Config {",
      "  const parsed: unknown = JSON.parse(raw);",
      "  return parsed as Config;",
      "}",
      "",
    ].join("\n");
    const [refused, ...rest] = refusals(written(root, "src/config.ts", source));
    expect(rest).toEqual([]);
    expect(refused).toStartWith("src/config.ts:4 `typescript/no-unsafe-type-assertion`: ");
    expect(refused).toContain("Parse outside data with a schema, or narrow the value with a type guard, instead of asserting its type.");
  });

  test("the rule docs' incorrect examples are refused and their correct ones let through, not judged on the syntax alone", () => {
    const root = project();
    const lines = [
      "function f() {",
      '  return Math.random() < 0.5 ? 42 : "oops";',
      "}",
      'const items = [1, "2", 3, "4"];',
      "export const z = f() as number;",
      "export const number = items[0] as number;",
      "export const wide = f() as number | string | boolean;",
      "export const wider = items[0] as number | string | undefined;",
      "",
    ];
    const lined = refusals(written(root, "src/f.ts", lines.join("\n"))).map((refused) => refused.split(" ")[0]);
    expect(lined).toEqual(["src/f.ts:5", "src/f.ts:6"]);
  });

  test("an assertion on a line the edit leaves alone is let through, not refused for what the file already held", () => {
    const before = ["type Config = { port: number };", "export const load = (raw: string): Config => JSON.parse(raw) as Config;", "export const port = 1;", ""].join("\n");
    const root = project({ "src/config.ts": before });
    const verdict = edited(root, "src/config.ts", before, [{ old: "export const port = 1;", new: "export const port = 2;", all: false }]);
    expect(refusals(verdict)).toEqual([]);
  });

  test("an assertion an edit adds to a file that already held one is refused on its own line only", () => {
    const before = ["type Config = { port: number };", "export const load = (raw: string): Config => JSON.parse(raw) as Config;", "export const port = 1;", ""].join("\n");
    const root = project({ "src/config.ts": before });
    const added = "export const again = (raw: string): Config => JSON.parse(raw) as Config;";
    const verdict = edited(root, "src/config.ts", before, [{ old: "export const port = 1;", new: `export const port = 1;\n${added}`, all: false }]);
    expect(refusals(verdict).map((refused) => refused.split(" ")[0])).toEqual(["src/config.ts:4"]);
  });
});

describe("ordinary type declarations", () => {
  test("domain unions, branded ids and signatures are let through, not refused as a second declaration", () => {
    const root = project();
    const source = [
      'export type Status = { status: "loading" } | { status: "ready"; data: string } | { status: "error"; error: Error };',
      "export type UserId = string & { readonly brand: unique symbol };",
      'export type Mode = "read" | "write";',
      "export interface Store { get(id: UserId): Status; put(id: UserId, mode: Mode): void }",
      "export function describe(status: Status, id: UserId): string {",
      '  return status.status === "ready" ? `${id}: ${status.data}` : status.status;',
      "}",
      "",
    ].join("\n");
    expect(refusals(written(root, "src/domain.ts", source))).toEqual([]);
  });
});

describe("the files the matcher reads", () => {
  test("a .ts or .tsx file in a project holding oxlint and the kit is read, and no other file", () => {
    const root = project();
    const at = (path: string) => ({ path, before: standing(root, path) });
    expect(reads("types", at("src/a.ts"))).toBe(true);
    expect(reads("types", at("src/a.tsx"))).toBe(true);
    expect(reads("types", at("src/a.js"))).toBe(false);
    expect(reads("types", at("docs/a.md"))).toBe(false);
  });

  test("a file in a project without oxlint is let through unread, not refused for a tool it does not have", () => {
    const root = project({}, false);
    expect(reads("types", { path: "src/a.ts", before: standing(root, "src/a.ts") })).toBe(false);
    expect(written(root, "src/user.ts", `${SCHEMA}export type UserShape = { id: string; age: number };\n`)).toEqual({ refusals: [] });
  });

  test("the copy oxlint reads is gone once it has judged, and so is a directory made for it", () => {
    const root = project({ "src/kept.ts": "export const kept = 1;\n" });
    refusals(written(root, "src/new/deep/user.ts", `${SCHEMA}export type UserShape = { id: string; age: number };\n`));
    expect(readdirSync(join(root, "src"))).toEqual(["kept.ts"]);
  });
});

describe("an oxlint that cannot judge", () => {
  const faking = (script: string): string => {
    const root = mkdtempSync(join(tmpdir(), "skills-types-test-"));
    roots.push(root);
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    mkdirSync(join(root, "node_modules", "@avi2dg", "checks", "dist", "data-shape"), { recursive: true });
    writeFileSync(join(root, "node_modules", "@avi2dg", "checks", "dist", "data-shape", "index.js"), "");
    writeFileSync(join(root, "node_modules", ".bin", "oxlint"), `#!/bin/sh\n${script}\n`);
    chmodSync(join(root, "node_modules", ".bin", "oxlint"), 0o755);
    return root;
  };

  test("one that fails leaves the write unread with oxlint's own words, not refused or let through as judged", () => {
    const root = faking("echo 'Failed to find tsgolint executable.'; exit 1");
    expect(written(root, "src/a.ts", "export const a = 1;\n")).toEqual({ unread: "oxlint failed: Failed to find tsgolint executable. on src/a.ts" });
  });

  test("one that runs past its budget is killed and leaves the write unread, not held until the hook times out", () => {
    const root = faking("sleep 30");
    const started = Date.now();
    expect(written(root, "src/a.ts", "export const a = 1;\n")).toEqual({ unread: `oxlint ran past ${LINT_SECONDS}s on src/a.ts` });
    expect(Date.now() - started).toBeLessThan((LINT_SECONDS + 3) * 1000);
  });
});
