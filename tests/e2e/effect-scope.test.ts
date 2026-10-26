import { expect, test } from "bun:test";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import { DISPATCHERS } from "../../src/generate/generate";
import { inLintScratch } from "./lib/lint-scratch";

const repo = new URL("../../", import.meta.url).pathname;
const OXLINT = `${repo}node_modules/.bin/oxlint`;
const EFFECT_TSGO = `${repo}node_modules/.bin/effect-tsgo`;
const LINT_RULES = [
  "effect-channel/no-throw",
  "effect-channel/no-try-catch",
  "node/no-sync",
  "oxc/no-async-await",
  "promise/avoid-new",
  "unicorn/no-process-exit",
];
const BUN_BAN = "eslint/no-restricted-properties";
const DIAGNOSTICS = ["asyncFunction", "extendsNativeError", "newPromise", "nodeBuiltinImport"];
const KIT_DIAGNOSTICS = ["anyUnknownInErrorContext", "catchAllToMapError", "unsafeEffectTypeAssertion"];
const SCOPED = "src/effect-scope-probe.ts";
const UNSCOPED = "tests/effect-kit-probe.ts";
const spawnTimeoutMs = 30_000;

// Every binding is prefixed, so appending it to a module that imports node:fs itself declares nothing twice.
const PROBE = `
import * as probeFs from "node:fs";
export const probeSync = (): string => probeFs.readFileSync("probe", "utf8");
export const probeBun = (): Promise<string> => Bun.file("probe").text();
export async function probeAsync(): Promise<number> {
  return 1;
}
export const probeNew = (): Promise<number> => new Promise((resolve) => resolve(1));
export const probeExit = (): void => process.exit(1);
export class ProbeError extends Error {}
export const probeThrow = (): never => {
  throw new ProbeError("probe");
};
export const probeCatch = (): number => {
  try {
    return JSON.stringify(probeFs).length;
  } catch {
    return 0;
  }
};
`;

// Without the kit's severities the first two are off and catchAllToMapError is only a message.
const KIT_PROBE = `
import { Effect } from "effect";
declare const failing: Effect.Effect<number, string>;
export const unknownFailure = (cause: unknown) => Effect.fail(cause);
export const narrowed = failing as Effect.Effect<number>;
export const remapped = failing.pipe(Effect.catch((error) => Effect.fail(error.length)));
`;

const bundled = [...new Set(DISPATCHERS.flatMap(({ bundle }) => Object.keys(bundle.files)))].filter((file) => file.startsWith("src/"));

// The probe lands in a scoped file and at the end of every bundled one, in a copy, so the tree the suite reads is untouched.
const inScratch = (check: (dir: string) => void): void => {
  inLintScratch("skills-effect-scope-", bundled, (dir) => {
    writeFileSync(join(dir, SCOPED), PROBE);
    for (const file of bundled) appendFileSync(join(dir, file), PROBE);
    check(dir);
  });
};

const decodeDiagnostics = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      diagnostics: Schema.Array(Schema.Struct({ file: Schema.String, name: Schema.String, severity: Schema.String })),
    }),
  ),
);

const Globs = Schema.Array(Schema.String);
const decodeTsconfig = Schema.decodeUnknownSync(
  Schema.Struct({
    compilerOptions: Schema.Struct({
      plugins: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          overrides: Schema.optionalKey(Schema.Array(Schema.Struct({ include: Globs, exclude: Schema.optionalKey(Globs) }))),
        }),
      ),
    }),
  }),
);

const typecheckIn = (dir: string): { file: string; name: string }[] => {
  const ran = Bun.spawnSync([EFFECT_TSGO, "diagnostics", "--project", "tsconfig.json", "--format", "json"], { cwd: dir });
  return decodeDiagnostics(ran.stdout.toString()).diagnostics.filter(({ severity }) => severity === "error");
};

const byFile = (found: readonly { file: string; rule: string }[], asked: readonly string[]): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const { file, rule } of found) {
    if (asked.includes(rule)) out.set(file, [...new Set([...(out.get(file) ?? []), rule])].toSorted());
  }
  return out;
};

const lintIn = (dir: string, asked: readonly string[]): Map<string, string[]> => {
  const ran = Bun.spawnSync([OXLINT, "-f", "unix", SCOPED, ...bundled], { cwd: dir });
  const found = ran.stdout
    .toString()
    .split("\n")
    .flatMap((line) => {
      const hit = /^([^:]+):\d+:\d+: .*\[Error\/([\w-]+)\(([\w-]+)\)\]$/.exec(line);
      return hit === null ? [] : [{ file: hit[1] ?? "", rule: `${hit[2]}/${hit[3]}` }];
    });
  return byFile(found, asked);
};

test("an Effect scope lint rule fails a src/ file no Dispatcher bundles, and none fires in a bundled one", () => {
  inScratch((dir) => {
    const reported = lintIn(dir, LINT_RULES);
    expect(reported.has(SCOPED), "no rule in LINT_RULES reports the scoped probe, so none is seen silent in a bundled file").toBe(true);
    expect(bundled.filter((file) => reported.has(file)), "a Dispatcher module is held to Effect, which it cannot import").toEqual([]);
  });
}, { timeout: spawnTimeoutMs });

test("the Bun global ban fails in every src/ file, bundled or not", () => {
  inScratch((dir) => {
    const reported = lintIn(dir, [BUN_BAN]);
    expect(reported.get(SCOPED)).toEqual([BUN_BAN]);
    expect(bundled.filter((file) => !reported.has(file)), "a Dispatcher module may reach for a Bun global, which pi's node does not have").toEqual([]);
  });
}, { timeout: spawnTimeoutMs });

test("an Effect scope diagnostic fails a src/ file no Dispatcher bundles, and none fires in a bundled one", async () => {
  const tsconfig = decodeTsconfig(await Bun.file(`${repo}tsconfig.json`).json());
  const service = tsconfig.compilerOptions.plugins.find((plugin) => plugin.name === "@effect/language-service");
  const held = service?.overrides?.find((override) => override.include.includes("**/*.ts"));
  if (!held) expect.unreachable("tsconfig.json holds no language-service override over **/*.ts");
  expect(
    held.exclude?.filter((glob) => glob.startsWith("src/")).toSorted(),
    "the language-service scope and src/generate/bundle.ts disagree, so a bundled file is held to Effect or a scoped one escapes it",
  ).toEqual(bundled.toSorted());

  inScratch((dir) => {
    const reported = byFile(
      typecheckIn(dir).map(({ file, name }) => ({ file: file.slice(file.indexOf("/src/") + 1), rule: name })),
      DIAGNOSTICS,
    );
    expect(reported.has(SCOPED), "no diagnostic in DIAGNOSTICS reports the scoped probe, so none is seen silent in a bundled file").toBe(true);
    expect(bundled.filter((file) => reported.has(file)), "a Dispatcher module is held to Effect, which it cannot import").toEqual([]);
  });
}, { timeout: spawnTimeoutMs });

test("tsconfig.json takes the kit's severities, so a diagnostic only the kit raises to error fails a file outside the scope", () => {
  const dir = mkdtempSync(join(tmpdir(), "skills-effect-kit-"));
  try {
    for (const entry of ["tsconfig.json"]) cpSync(`${repo}${entry}`, join(dir, entry));
    symlinkSync(`${repo}node_modules`, join(dir, "node_modules"));
    mkdirSync(join(dir, "tests"));
    writeFileSync(join(dir, UNSCOPED), KIT_PROBE);
    const reported = byFile(
      typecheckIn(dir).map(({ file, name }) => ({ file: file.slice(file.indexOf("/tests/") + 1), rule: name })),
      KIT_DIAGNOSTICS,
    );
    expect(reported.get(UNSCOPED), "tsconfig.json no longer takes the kit's language-service severities").toEqual(KIT_DIAGNOSTICS);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, { timeout: spawnTimeoutMs });
