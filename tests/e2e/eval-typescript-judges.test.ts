import { expect, setDefaultTimeout, test } from "bun:test";
import { noSchemaTwin } from "../../evals/typescript-judges";
import { verdictOf, type Change } from "../../src/eval/eval-judges";
import { run } from "../lib/eval-run";

// Oxlint and tsgolint outlast bun's 5s default on a loaded machine.
setDefaultTimeout(60_000);

const SCHEMA = 'import { Schema } from "effect";\n\nexport const User = Schema.Struct({ id: Schema.String, age: Schema.Number });\n';

const users = (body: string): Change => ({ path: "src/users.ts", before: SCHEMA, after: `${SCHEMA}${body}\n` });

test("a type repeating a schema's fields on a line the run added fails, naming the line, and a type derived from the schema passes", () => {
  expect(verdictOf(noSchemaTwin, run([], [users("export type UserShape = { id: string; age: number };")]))).toMatchObject({
    outcome: "fail",
    judge: "no-schema-twin",
    evidence: [expect.stringMatching(/^src\/users\.ts:4 `data-shape\/schema-twin`: .*Derive it as `typeof User\.Type` instead of writing both\.$/)],
  });
  expect(verdictOf(noSchemaTwin, run([], [users("export type UserShape = typeof User.Type;")])).outcome).toBe("pass");
});

test("a twin the file already held before the run is not the run's, so the run passes", () => {
  const held = `${SCHEMA}export type UserShape = { id: string; age: number };\n`;
  const kept: Change = { path: "src/users.ts", before: held, after: `${held}export const count = 1;\n` };
  expect(verdictOf(noSchemaTwin, run([], [kept])).outcome).toBe("pass");
});
