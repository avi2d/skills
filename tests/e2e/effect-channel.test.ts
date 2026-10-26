import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";

const repo = new URL("../../", import.meta.url).pathname;
const OXLINT = `${repo}node_modules/.bin/oxlint`;
const PLUGIN = `${repo}node_modules/@avi2dg/checks/dist/effect-channel/index.js`;

setDefaultTimeout(30_000);

const DROPS = "it drops the failure and the success together";
const SWALLOWS = "a Cause is the typed error plus defects plus interruption";
const BLIND = "the handler cannot see what it is recovering from";

const IMPORTS = 'import { Effect } from "effect";\ndeclare const work: Effect.Effect<number, Error>;\n';

const RULE_ONLY = {
  jsPlugins: [PLUGIN],
  categories: { correctness: "off" },
  rules: { "effect-channel/no-error-channel-escape": "error" },
};

const decodeReport = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, filename: Schema.String })),
      number_of_files: Schema.Int,
    }),
  ),
);

async function refusals(source: string): Promise<string[]> {
  const cwd = await mkdtemp(join(tmpdir(), "effect-channel-"));
  try {
    await writeFile(join(cwd, ".oxlintrc.json"), JSON.stringify(RULE_ONLY));
    await writeFile(join(cwd, "app.ts"), source);
    const ran = Bun.spawnSync([OXLINT, "--disable-nested-config", "-f", "unix", "app.ts"], { cwd });
    return ran.stdout
      .toString()
      .split("\n")
      .filter((line) => line.includes("no-error-channel-escape"))
      .map((line) => line.replace(/^app\.ts:(\d+):\d+: /, "app.ts:$1 "));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("`Effect.ignore` is refused, and the refusal says what to reach for instead", async () => {
  expect(await refusals(`${IMPORTS}export const done = work.pipe(Effect.ignore);\n`)).toEqual([
    `app.ts:3 Effect.ignore erases the error channel: ${DROPS}, so no caller can tell one from the other. Handle the error by tag, or keep it as a value with Effect.result or Effect.exit [Error/effect-channel(no-error-channel-escape)]`,
  ]);
  expect(await refusals(`${IMPORTS}export const done = Effect.ignoreCause(work);\n`), "the cause variant is the same move").toHaveLength(1);
});

test("`Effect.catchCause` is refused, and so are the filtered forms of it", async () => {
  expect(await refusals(`${IMPORTS}export const done = work.pipe(Effect.catchCause(() => Effect.void));\n`)).toEqual([
    `app.ts:3 Effect.catchCause erases the error channel: ${SWALLOWS}, so this swallows the bugs and the cancellations along with it. Catch the errors you named, with Effect.catchTag or Effect.catchTags [Error/effect-channel(no-error-channel-escape)]`,
  ]);
  for (const form of ["catchCauseIf", "catchCauseFilter"]) {
    expect(await refusals(`${IMPORTS}export const done = Effect.${form}(work, p, h);\n`), form).toHaveLength(1);
  }
});

test("a catch-all whose handler cannot see the error is refused, however it spells the parameter", async () => {
  expect(await refusals(`${IMPORTS}export const done = work.pipe(Effect.catch(() => Effect.succeed(0)));\n`)).toEqual([
    `app.ts:3 Effect.catch erases the error channel: ${BLIND}, so every error in the channel collapses into one fallback. Name the errors with Effect.catchTag, or take the error and use it [Error/effect-channel(no-error-channel-escape)]`,
  ]);
  for (const blind of ["(_) =>", "_ =>", "(_: unknown) =>", "(__) =>"]) {
    expect(await refusals(`${IMPORTS}export const done = work.pipe(Effect.catch(${blind} Effect.succeed(0)));\n`), blind).toHaveLength(1);
  }
  const expression = "export const done = work.pipe(Effect.catch(function () { return Effect.succeed(0); }));";
  expect(await refusals(`${IMPORTS}${expression}\n`), "a function expression hides the same blindness").toHaveLength(1);
});

test("the data-first call is the same escape as the piped one, which is what the shipped script could not see", async () => {
  expect(await refusals(`${IMPORTS}export const done = Effect.catch(work, () => Effect.succeed(0));\n`)).toHaveLength(1);
  expect(await refusals(`${IMPORTS}export const done = Effect.catch(work, (_) => Effect.succeed(0));\n`)).toHaveLength(1);
});

test("the module under any local name is the same module, which is the other thing the shipped script could not see", async () => {
  const aliased = 'import * as E from "effect/Effect";\ndeclare const work: E.Effect<number, Error>;\n';
  expect(await refusals(`${aliased}export const done = E.ignore(work);\n`)).toHaveLength(1);
  expect(await refusals(`${aliased}export const done = E.catchCause(work, () => E.void);\n`)).toHaveLength(1);
  const renamed = 'import { Effect as Fx } from "effect";\ndeclare const work: Fx.Effect<number, Error>;\n';
  expect(await refusals(`${renamed}export const done = Fx.ignore(work);\n`)).toHaveLength(1);
});

test("the Effect the library asks for is left alone", async () => {
  const good = [
    "export const named = work.pipe(Effect.catch((error) => Effect.succeed(error.message.length)));",
    'export const tagged = work.pipe(Effect.catchTag("Boom", (_) => Effect.succeed(0)));',
    "export const conditional = work.pipe(Effect.catchIf(isTransient, () => Effect.succeed(0)));",
    "export const handed = work.pipe(Effect.catch(recover));",
    "export const kept = Effect.result(work);",
    "export const died = work.pipe(Effect.orDie);",
    "export const converted = work.pipe(Effect.mapError((cause) => new RangeError(String(cause))));",
  ];
  const declarations = "declare function isTransient(error: Error): boolean;\ndeclare function recover(error: Error): Effect.Effect<number>;\n";
  for (const line of good) expect(await refusals(`${IMPORTS}${declarations}${line}\n`), line).toEqual([]);
});

test("a name that is not the Effect module is not an escape, and neither is a name in a string", async () => {
  const source = [
    "declare const shell: { ignore: () => void; catchCause: () => void };",
    "export const unrelated = shell.ignore();",
    "export const alsoUnrelated = shell.catchCause();",
    'export const spoken = "Effect.ignore";',
    "export const templated = `${spoken} Effect.catchCause`;",
    "// Effect.catch(() => 0)",
  ].join("\n");
  expect(await refusals(`${IMPORTS}${source}\n`)).toEqual([]);
});

test("this repository's own config is what refuses an escape, and this tree holds none", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "effect-channel-repo-"));
  try {
    const planted = join(cwd, "planted.ts");
    await writeFile(planted, `${IMPORTS}export const done = work.pipe(Effect.ignore);\n`);
    const onPlanted = Bun.spawnSync([OXLINT, "--disable-nested-config", "-f", "unix", planted], { cwd: repo });
    expect(onPlanted.stdout.toString(), "the repository's own config does not carry the rule").toContain(
      "Effect.ignore erases the error channel",
    );
    expect(onPlanted.exitCode, "an escape does not fail the run").toBe(1);

    // The repository's own config would start the type-aware engine over the whole tree, and this rule reads no types.
    const ruleOnly = join(cwd, "rule-only.json");
    await writeFile(ruleOnly, JSON.stringify(RULE_ONLY));
    const onRepo = decodeReport(Bun.spawnSync([OXLINT, "--disable-nested-config", "-c", ruleOnly, "-f", "json"], { cwd: repo }).stdout.toString());
    const tracked = Bun.spawnSync(["git", "ls-files", "-z", "--", "*.ts"], { cwd: repo }).stdout.toString().split("\0").filter(Boolean);
    expect(onRepo.number_of_files, "the lint read fewer files than git tracks, so finding nothing says nothing").toBeGreaterThanOrEqual(
      tracked.length,
    );
    const escapes = onRepo.diagnostics.filter(({ code }) => code === "effect-channel(no-error-channel-escape)").map(({ filename }) => filename);
    expect(escapes).toEqual([]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
