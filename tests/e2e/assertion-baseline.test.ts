import { expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import oxlintConfig from "../../oxlint.config";
import { inLintScratch } from "./lib/lint-scratch";

const repo = new URL("../../", import.meta.url).pathname;
const OXLINT = `${repo}node_modules/.bin/oxlint`;
const BASELINE = "oxlint-suppressions.json";
const NON_NULL = "typescript/no-non-null-assertion";
const UNSAFE_AS = "typescript/no-unsafe-type-assertion";
const ASSERTION_RULES = [NON_NULL, UNSAFE_AS];
const spawnTimeoutMs = 30_000;

const PROBES: Record<string, string> = {
  [NON_NULL]: "declare const assertionProbeMaybe: string | undefined;\nexport const assertionProbe = assertionProbeMaybe!.length;\n",
  [UNSAFE_AS]: 'export const assertionProbe = JSON.parse("{}") as { probe: number };\n',
};

const Rules = Schema.Record(Schema.String, Schema.Unknown);
const decodeBaseline = Schema.decodeUnknownSync(Schema.Record(Schema.String, Rules));
const decodeConfig = Schema.decodeUnknownSync(
  Schema.Struct({
    rules: Schema.optionalKey(Rules),
    overrides: Schema.optionalKey(Schema.Array(Schema.Struct({ rules: Rules }))),
  }),
);
const decodeReport = Schema.decodeUnknownSync(
  Schema.Struct({ diagnostics: Schema.Array(Schema.Struct({ filename: Schema.String, code: Schema.String })) }),
);

const config = decodeConfig(oxlintConfig);
const overrides = config.overrides ?? [];
const topLevel = (path: string): string => path.replace(/\/.*$/, "");
const typescript = Bun.spawnSync(["git", "ls-files", "-z", "--", "*.ts", "*.tsx", "*.mts", "*.cts"], { cwd: repo })
  .stdout.toString()
  .split("\0")
  .filter(Boolean);
const typescriptDirs = [...new Set(typescript.filter((path) => path.includes("/")).map(topLevel))];

type Lint = { exitCode: number; diagnostics: readonly { filename: string; code: string }[] };

// The default format is chosen by what oxlint detects around it, an agent or a CI, so only JSON parses the same everywhere.
const inScratch = (sources: readonly string[], check: (dir: string, lint: (file: string) => Lint) => void): void => {
  inLintScratch("skills-assertion-baseline-", sources, (dir) => {
    check(dir, (file) => {
      const ran = Bun.spawnSync([OXLINT, "--format", "json", file], { cwd: dir });
      return { exitCode: ran.exitCode, diagnostics: decodeReport(JSON.parse(ran.stdout.toString())).diagnostics };
    });
  });
};

const failsOn = (ran: Lint, file: string, rule: string): void => {
  expect(ran.diagnostics, `the probe in ${file} is not the one thing the lint reports`).toEqual([
    { filename: file, code: `${rule.replace("/", "(")})` },
  ]);
  expect(ran.exitCode).toBe(1);
};

test("both assertion rules are errors for every file, and no override narrows or lifts them", () => {
  expect(ASSERTION_RULES.map((rule) => config.rules?.[rule]), "oxlint.config.ts does not turn the assertion rules on for every file").toEqual([
    "error",
    "error",
  ]);
  const scoping = overrides.filter((override) => ASSERTION_RULES.some((rule) => rule in override.rules));
  expect(scoping, "an override sets an assertion rule for only some files").toEqual([]);
});

test("the probes below stand in every directory that holds tracked TypeScript, so none of them is vacuous", () => {
  expect(typescriptDirs, "git listed none of the directories the probes are meant to stand in").toEqual(
    expect.arrayContaining(["harness", "src", "tests"]),
  );
});

test("the suppressions baseline is absent or empty", () => {
  const baseline = existsSync(`${repo}${BASELINE}`) ? decodeBaseline(JSON.parse(readFileSync(`${repo}${BASELINE}`, "utf8"))) : {};
  expect(Object.keys(baseline), "oxlint-suppressions.json suppresses a finding; fix it instead").toEqual([]);
});

for (const rule of ASSERTION_RULES) {
  test(`a new ${rule} site fails the lint in an existing file`, () => {
    const file = "src/dispatcher/dispatch.ts";
    inScratch(["src"], (dir, lint) => {
      appendFileSync(join(dir, file), `\n${PROBES[rule]}`);
      failsOn(lint(file), file, rule);
    });
  }, { timeout: spawnTimeoutMs });

  for (const scoped of typescriptDirs) {
    test(`a new ${rule} site fails the lint in a file under ${scoped}/`, () => {
      inScratch([], (dir, lint) => {
        const file = `${scoped}/assertion-probe.ts`;
        mkdirSync(join(dir, scoped), { recursive: true });
        writeFileSync(join(dir, file), PROBES[rule] ?? "");
        failsOn(lint(file), file, rule);
      });
    }, { timeout: spawnTimeoutMs });
  }
}
