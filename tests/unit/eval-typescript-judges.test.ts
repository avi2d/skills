import { expect, test } from "bun:test";
import { keepsTheErrorChannel, noTypeAssertion } from "../../evals/typescript-judges";
import { verdictOf, type Change } from "../../src/eval/eval-judges";
import { added, run } from "../lib/eval-run";

const config = (body: string): Change => added("src/config.ts", `import type { Config } from "./types";\n\n${body}\n`);

test("a type assertion in the code a run added fails, naming the line, and narrowing passes", () => {
  const asserted = config("export const load = (text: string): Config => JSON.parse(text) as Config;");
  expect(verdictOf(noTypeAssertion, run([], [asserted]))).toEqual({
    outcome: "fail",
    judge: "no-type-assertion",
    kind: "program",
    evidence: ["src/config.ts:3 makes an `as` assertion"],
  });
  const doubled = config("export const load = (text: string): Config => <Config>(JSON.parse(text) as unknown as object);");
  expect(verdictOf(noTypeAssertion, run([], [doubled]))).toMatchObject({
    evidence: ["src/config.ts:3 makes an angle-bracket assertion", "src/config.ts:3 makes an `as` assertion"],
  });
  const narrowed = config(
    'export const port = (value: unknown): number => {\n  if (typeof value !== "number") throw new Error(`port is not a number: ${String(value)}`);\n  return value;\n};\nexport const NAMES = ["a", "b"] as const;\nexport const loose = 1 as unknown;\nexport const checked = { port: 1 } satisfies { port: number };',
  );
  expect(verdictOf(noTypeAssertion, run([], [narrowed])).outcome).toBe("pass");
});

test("a non-null claim or an any alone is not a type assertion, so it passes", () => {
  const claimed = config("export const port = (ports: Map<string, number>, name: string): number => ports.get(name)!;\nlet raw: any;");
  expect(verdictOf(noTypeAssertion, run([], [claimed])).outcome).toBe("pass");
});

test("an assertion the file already held is not the run's, and a later file's lines are its own", () => {
  const held = "export const a = JSON.parse('1') as number;\n";
  const kept: Change = { path: "src/a.ts", before: held, after: `${held}export const b = 2;\n` };
  const later: Change = { path: "src/b.ts", before: "\n\n\n", after: "\n\n\nexport const c = JSON.parse('2') as number;\n" };
  expect(verdictOf(noTypeAssertion, run([], [kept, later]))).toMatchObject({ outcome: "fail", evidence: ["src/b.ts:4 makes an `as` assertion"] });
});

test("a run that changed no TypeScript, or left a file that does not parse, is not judged on its assertions", () => {
  expect(verdictOf(noTypeAssertion, run([], [added("README.md", "x as any")]))).toEqual({
    outcome: "unjudged",
    why: "the agent changed no TypeScript file, so there was no code to judge",
  });
  expect(verdictOf(noTypeAssertion, run([], [added("src/a.ts", "export const = ;\n")]))).toMatchObject({
    outcome: "unjudged",
    why: expect.stringContaining("src/a.ts does not parse"),
  });
});

const main = (body: string): Change => ({ path: "src/main.ts", before: 'import { Effect } from "effect";\n', after: `import { Effect } from "effect";\n${body}\n` });
const channel = keepsTheErrorChannel({ failuresHappen: true });

test("each move that erases an error unseen fails, naming it and the line", () => {
  const erased = main(
    [
      "export const a = sync.pipe(Effect.ignore);",
      "export const b = sync.pipe(Effect.catch(() => Effect.void));",
      "export const c = Effect.catch(sync, (_error) => Effect.void);",
      "export const d = sync.pipe(Effect.catch((error) => Effect.succeed(500)));",
      "export const e = sync.pipe(Effect.catchCause((cause) => Effect.logError(cause)));",
      "export const f = sync.pipe(Effect.orElseSucceed(() => 0));",
      "export const g = sync.pipe(Effect.orDie);",
    ].join("\n"),
  );
  expect(verdictOf(channel, run([], [erased]))).toEqual({
    outcome: "fail",
    judge: "keeps-the-error-channel",
    kind: "program",
    evidence: [
      "src/main.ts:2 erases the error with `Effect.ignore`",
      "src/main.ts:3 erases the error with `Effect.catch`, whose handler never reads it",
      "src/main.ts:4 erases the error with `Effect.catch`, whose handler never reads it",
      "src/main.ts:5 erases the error with `Effect.catch`, whose handler never reads it",
      "src/main.ts:6 erases the error with `Effect.catchCause`",
      "src/main.ts:7 erases the error with `Effect.orElseSucceed`, whose handler never reads it",
      "src/main.ts:8 erases the error with `Effect.orDie`, claiming a failure the task says happens can never happen",
    ],
  });
});

test("handling by tag, a handler that reads the error, keeping it as a value and naming it in prose all pass", () => {
  const kept = main(
    [
      "// Effect.ignore would drop the failure here.",
      'export const a = sync.pipe(Effect.catchTags({ FetchFailed: (error) => Effect.logWarning(error.url), RowMalformed: () => Effect.void }));',
      "export const b = sync.pipe(Effect.catch((error) => Effect.logError(`sync failed: ${error._tag}`)));",
      "export const c = sync.pipe(Effect.result);",
      'export const d = "Effect.orDie";',
    ].join("\n"),
  );
  expect(verdictOf(channel, run([], [kept])).outcome).toBe("pass");
  expect(verdictOf(keepsTheErrorChannel({ failuresHappen: false }), run([], [main("export const g = sync.pipe(Effect.orDie);")])).outcome).toBe("pass");
  expect(verdictOf(channel, run([], []))).toMatchObject({ outcome: "unjudged" });
});
