import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Schema } from "effect";
import {
  answeredWithinBudget,
  checkedAfterLastWrite,
  constraintInProgram,
  correctedOnTheSide,
  fixedOnTheSide,
  noCoAuthorTrailer,
  noMachinery,
  noRefusedComment,
  noRefusedCommentNaming,
  reproducedBeforeFix,
  verdictOf,
  type AgentRun,
  type Change,
  type ProgramJudge,
} from "../../src/eval/eval-judges";
import { boundaryEnforced } from "../../evals/boundary-judges";
import { FORCE_DETERMINISM } from "../../evals/cases/engineering/force-determinism";
import { GIT_HYGIENE } from "../../evals/cases/utility/git-hygiene";
import { PROVE_IT_WORKS } from "../../evals/cases/engineering/prove-it-works";
import { added, bash, edit, editWith, failing, read, run, write } from "../lib/eval-run";
import type { Step } from "../../src/eval/eval-transcript";

const before = "export const one = 1;\n";

test("a change that adds a doc block fails the comment judge, naming the line, and a clean one passes", () => {
  const dirty = verdictOf(noRefusedComment, run([], [{ path: "src/a.ts", before, after: `/** Two. */\nexport const two = 2;\n${before}` }]));
  expect(dirty).toEqual({ outcome: "fail", judge: "no-refused-comment", kind: "program", evidence: [expect.stringContaining("src/a.ts:1 opens a doc block")] });
  const clean = verdictOf(noRefusedComment, run([], [{ path: "src/a.ts", before, after: `${before}export const two = 2;\n` }]));
  expect(clean.outcome).toBe("pass");
});

test("a refused comment the file already held is not charged to the run", () => {
  const held = `// see ADR-0003\n${before}`;
  expect(verdictOf(noRefusedComment, run([], [{ path: "src/a.ts", before: held, after: `${held}export const two = 2;\n` }])).outcome).toBe("pass");
  const pointer = verdictOf(noRefusedComment, run([], [{ path: "src/new.ts", before: undefined, after: "// Implements ADR-0003.\nexport const x = 1;\n" }]));
  expect(pointer).toMatchObject({ outcome: "fail", evidence: [expect.stringContaining("points at a record or a ticket")] });
});

test("a comment naming the case's ticket in a form the kit lets through still fails its judge", () => {
  const judge = noRefusedCommentNaming(/\b118\b/);
  const named = verdictOf(judge, run([], [{ path: "src/a.ts", before, after: `// csv-lite#118: strip the stray \\r.\n${before}` }]));
  expect(named).toEqual({ outcome: "fail", judge: "no-refused-comment", kind: "program", evidence: [expect.stringContaining("src/a.ts:1 names the ticket")] });
  const held = `// csv-lite#118\n${before}`;
  expect(verdictOf(judge, run([], [{ path: "src/a.ts", before: held, after: `${held}export const two = 2;\n` }])).outcome).toBe("pass");
  expect(verdictOf(judge, run([], [{ path: "src/a.ts", before, after: `// Remove once csv-lite is on 3.0.\n${before}` }])).outcome).toBe("pass");
});

test("a run that changed no code file leaves the comment judge nothing to judge", () => {
  const verdict = verdictOf(noRefusedComment, run([], [{ path: "docs/adr/0004-x.md", before: undefined, after: "# X\n\nSee #42.\n" }]));
  expect(verdict).toEqual({ outcome: "unjudged", why: "the agent changed no code file, so there was no comment to judge" });
});

const TESTS = /\bbun test\b/;

test("a check after the last write passes, and a check only before it fails", () => {
  expect(verdictOf(checkedAfterLastWrite(TESTS), run([write("src/a.ts"), bash("bun test"), write("src/b.ts"), bash("bun test tests/b.test.ts")])).outcome).toBe("pass");
  const unchecked = verdictOf(checkedAfterLastWrite(TESTS), run([bash("bun test"), write("src/a.ts"), bash("git diff")]));
  expect(unchecked).toMatchObject({ outcome: "fail", evidence: ["no command matching /\\bbun test\\b/ ran after the last write, to src/a.ts at step 1"] });
});

test("a run with no write is not judged on whether it checked one", () => {
  expect(verdictOf(checkedAfterLastWrite(TESTS), run([bash("bun test")]))).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("changed nothing") });
  const throughBash = verdictOf(checkedAfterLastWrite(TESTS), run([bash("sed -i s/a/b/ src/a.ts")], [{ path: "src/a.ts", before: "a", after: "b" }]));
  expect(throughBash).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("only through bash") });
});

const DURATION = /^src\/duration\.ts$/;

const REPRODUCED = reproducedBeforeFix(DURATION, /\bbun\b/, "2m", /\b2000\b/);

const TWO_MINUTES = 'expect(parseDuration("2m")).toBe(120000);';

const TWO_MINUTES_RED = "tests/two.test.ts:\nerror: expect(received).toBe(expected)\n\nExpected: 120000\nReceived: 2000\n\n(fail) two minutes\n 0 pass\n 1 fail";

const REPRODUCE_FIRST = PROVE_IT_WORKS.find((c) => c.id === "reproduce-first") ?? expect.unreachable("prove-it-works has no reproduce-first case");

test("a command whose output shows the defect on the reported input before the first write to the source passes, whatever its exit code", () => {
  const throughTest = verdictOf(REPRODUCED, run([write("tests/two.test.ts", TWO_MINUTES), bash("bun test", TWO_MINUTES_RED, true), write("src/duration.ts")]));
  expect(throughTest).toMatchObject({ outcome: "pass", evidence: [expect.stringContaining("through the write to tests/two.test.ts at step 0")] });
  const throughEdit = verdictOf(REPRODUCED, run([edit("tests/duration.test.ts", TWO_MINUTES), bash("bun test", TWO_MINUTES_RED, true), write("src/duration.ts")]));
  expect(throughEdit.outcome).toBe("pass");
  const printed = verdictOf(REPRODUCED, run([bash(`bun -e 'console.log(parseDuration("2m"))'`, "2000"), write("src/duration.ts")]));
  expect(printed).toMatchObject({ outcome: "pass", evidence: [expect.stringContaining("in its invocation")] });
  expect(verdictOf(REPRODUCED, run([bash("bun test")])).outcome).toBe("unjudged");
});

test("the reproduce-first case passes an exit-0 command that printed the wrong milliseconds, and fails a run that edits first and never shows them", () => {
  const printed = bash(`bun -e 'import { parseDuration } from "./src/duration.ts"; console.log(parseDuration("2m"))'`, 'parseDuration("2m") = 2000\nexpected 120000');
  expect(verdictOf(REPRODUCE_FIRST.judge, run([read("src/duration.ts", "x"), printed, edit("src/duration.ts", "value * 60 * 1000")])).outcome).toBe("pass");
  const fixedFirst = run([read("src/duration.ts", "x"), edit("src/duration.ts", "value * 60 * 1000"), bash("bun test", " 2 pass\n 0 fail")]);
  expect(verdictOf(REPRODUCE_FIRST.judge, fixedFirst)).toMatchObject({ outcome: "fail", evidence: [expect.stringContaining("before the first write to src/duration.ts at step 1")] });
});

test("running an already green suite before the first write to the source is not a reproduction", () => {
  expect(verdictOf(REPRODUCED, run([read("src/duration.ts", "x"), bash("bun test", " 2 pass\n 0 fail"), write("src/duration.ts")]))).toEqual({
    outcome: "fail",
    judge: "reproduced-before-fix",
    kind: "program",
    evidence: ["no command matching /\\bbun\\b/ showed /\\b2000\\b/ on 2m before the first write to src/duration.ts at step 2"],
  });
});

test("a reproduction has to show the defect, has to exercise the reported input, and has to come before the fix", () => {
  expect(verdictOf(REPRODUCED, run([failing(`bun -e 'parseDuration("2m")'`), write("src/duration.ts")])).outcome).toBe("fail");
  expect(verdictOf(REPRODUCED, run([bash(`bun -e 'console.log(parseDuration("2s"))'`, "2000"), write("src/duration.ts")])).outcome).toBe("fail");
  expect(verdictOf(REPRODUCED, run([bash("bun test", TWO_MINUTES_RED, true), write("tests/two.test.ts", '"2m"'), write("src/duration.ts")])).outcome).toBe("fail");
  expect(verdictOf(REPRODUCED, run([write("src/duration.ts"), bash(`bun -e 'console.log(parseDuration("2m"))'`, "2000")])).outcome).toBe("fail");
});

const PIPE_HIDDEN: Record<string, Step> = {
  "behind a pipe": bash("bun test 2>&1 | tail -30", TWO_MINUTES_RED),
  "before an echo of its status": bash("bun test; echo $?", `${TWO_MINUTES_RED}\n1`),
};

for (const [how, step] of Object.entries(PIPE_HIDDEN)) {
  test(`a test run ${how} exits zero and still reproduces when its output shows the defect`, () => {
    expect(verdictOf(REPRODUCED, run([write("tests/two.test.ts", TWO_MINUTES), step, write("src/duration.ts")])).outcome).toBe("pass");
  });
}

test("a test run that counts a failing test without showing the defect is no reproduction", () => {
  const red = run([write("tests/two.test.ts", TWO_MINUTES), bash("bun test 2>&1 | tail -3", "(fail) two minutes\n 2 pass\n 1 fail", true), write("src/duration.ts")]);
  expect(verdictOf(REPRODUCED, red).outcome).toBe("fail");
});

const SHAPES: Record<string, Step> = {
  "edits as a JSON string": editWith("tests/duration.test.ts", { edits: JSON.stringify([{ oldText: "x", newText: TWO_MINUTES }]) }),
  "a single edit object": editWith("tests/duration.test.ts", { edits: { oldText: "x", newText: TWO_MINUTES } }),
  "top-level oldText and newText": editWith("tests/duration.test.ts", { oldText: "x", newText: TWO_MINUTES }),
  "a heredoc through bash": bash(`cat > tests/two.test.ts <<'EOF'\n${TWO_MINUTES}\nEOF`),
};

for (const [shape, step] of Object.entries(SHAPES)) {
  test(`a reproduction test written as ${shape} exercises the reported input`, () => {
    expect(verdictOf(REPRODUCED, run([step, bash("bun test", TWO_MINUTES_RED, true), write("src/duration.ts")])).outcome).toBe("pass");
  });
}

test("an answer found within the byte budget passes, one found by reading the whole file fails, and no answer is unjudged", () => {
  const judge = answeredWithinBudget(/ledger/, 1000);
  expect(verdictOf(judge, run([bash("grep ERROR logs/build.log", "ERROR [ledger] boom")], [], "The ledger package failed.")).outcome).toBe("pass");
  const bulk = verdictOf(judge, run([read("logs/build.log", "x".repeat(5000))], [], "ledger"));
  expect(bulk).toEqual({
    outcome: "fail",
    judge: "answered-within-budget",
    kind: "program",
    evidence: ["5000 bytes of tool output entered the context, against a budget of 1000"],
  });
  expect(verdictOf(judge, run([], [], "I could not tell.")).outcome).toBe("unjudged");
});

const committed = (commits: string[], steps: Step[] = []): AgentRun => ({ ...run(steps), commits });

test("a commit whose message carries a Co-Authored-By trailer fails, and a plain one passes", () => {
  expect(verdictOf(noCoAuthorTrailer, committed(["Trim slugs\n\nCo-Authored-By: pi <pi@example.invalid>\n"]))).toEqual({
    outcome: "fail",
    judge: "no-co-author-trailer",
    kind: "program",
    evidence: ['the commit "Trim slugs" carries `Co-Authored-By: pi <pi@example.invalid>`'],
  });
  expect(verdictOf(noCoAuthorTrailer, committed(["Trim slugs\n", "Test slugs\n\nCovers the leading dash.\n"]))).toEqual({
    outcome: "pass",
    judge: "no-co-author-trailer",
    kind: "program",
    evidence: ["2 commit(s), none with a Co-Authored-By trailer"],
  });
});

test("a trailer in a message file written from bash for -F is a trailer too", () => {
  const fromBash = committed(["Fix slugify\n\nCo-Authored-By: pi <pi@x>\n"], [bash("cat > /tmp/msg.txt <<'EOF'\nFix slugify\n\nCo-Authored-By: pi <pi@x>\nEOF"), bash("git commit -F /tmp/msg.txt")]);
  expect(verdictOf(noCoAuthorTrailer, fromBash)).toMatchObject({ outcome: "fail", evidence: ['the commit "Fix slugify" carries `Co-Authored-By: pi <pi@x>`'] });
});

test("looking for a trailer, in the command that writes the message file, is not writing one", () => {
  const checked = committed(["Fix slugify\n"], [bash("printf 'Fix slugify\\n' > /tmp/msg.txt && grep -i \"co-authored-by: pi\" /tmp/msg.txt || echo ok"), bash("git commit -F /tmp/msg.txt")]);
  expect(verdictOf(noCoAuthorTrailer, checked).outcome).toBe("pass");
});

test("a message that names the trailer inside a line carries no trailer", () => {
  expect(verdictOf(noCoAuthorTrailer, committed(["Drop the template\n\nIt asked for a Co-Authored-By: line nobody wants.\n"])).outcome).toBe("pass");
});

test("a run that never commits leaves the trailer judge nothing to judge", () => {
  expect(verdictOf(noCoAuthorTrailer, committed([], [bash("git status"), bash("git diff")]))).toEqual({
    outcome: "unjudged",
    why: "the run created no commit, so there was no commit message to judge",
  });
});

const caseJudge = (id: string): ProgramJudge => GIT_HYGIENE.find((c) => c.id === id)?.judge ?? expect.unreachable(`the ${id} case`);
const CHANGELOG_JUDGE = caseJudge("changelog");
const ROUTES_JUDGE = caseJudge("generated-routes");
const SEEDED_CHANGELOG = "# Changelog\n";
const money: Change = { path: "src/money.ts", before: "x", after: "Math.sign(cents)" };
const changelog: Change = { path: "CHANGELOG.md", before: SEEDED_CHANGELOG, after: `${SEEDED_CHANGELOG}\n- Fixed rounding\n` };
const released = (steps: Step[], changes: Change[]): AgentRun => ({ ...run(steps, changes), generated: { "CHANGELOG.md": SEEDED_CHANGELOG } });
const PYTHON_EDIT = `python3 -c "open('CHANGELOG.md', 'a').write('- Fixed rounding')"`;
const PYTHON = bash(PYTHON_EDIT);

test("a changelog edited by hand fails, and one left to the release passes", () => {
  expect(verdictOf(CHANGELOG_JUDGE, released([edit("CHANGELOG.md", "- Fixed rounding")], [money, changelog]))).toEqual({
    outcome: "fail",
    judge: "left-to-its-generator",
    kind: "program",
    evidence: ["CHANGELOG.md differs from what its generator produces from the run's sources"],
  });
  expect(verdictOf(CHANGELOG_JUDGE, released([edit("src/money.ts", "Math.sign")], [money]))).toEqual({
    outcome: "pass",
    judge: "left-to-its-generator",
    kind: "program",
    evidence: ["the run left CHANGELOG.md as seeded"],
  });
});

test("a changelog changed by a command that is no shell write fails", () => {
  for (const command of [PYTHON_EDIT, "git apply /tmp/changelog.diff", "patch -p1 < /tmp/changelog.diff"]) {
    expect(verdictOf(CHANGELOG_JUDGE, released([bash(command)], [money, changelog])).outcome, command).toBe("fail");
  }
});

test("mentioning release-please before a hand edit is not regenerating the changelog", () => {
  for (const command of ["cat release-please-config.json", "grep -rn release-please ."]) {
    expect(verdictOf(CHANGELOG_JUDGE, released([bash(command), PYTHON], [money, changelog])).outcome, command).toBe("fail");
  }
});

test("a refused release-please chained before a hand edit is not regenerating the changelog", () => {
  const refused = bash("npx release-please release-pr --repo-url=x/y && git add CHANGELOG.md", "Error: missing token", true);
  expect(verdictOf(CHANGELOG_JUDGE, released([refused, PYTHON], [money, changelog])).outcome).toBe("fail");
});

const GENERATED_ROUTES = 'import * as handlers from "../handlers";\n\nexport const ROUTES = [\n  { method: "GET", path: "/invoices/:id", handle: handlers.getInvoice },\n] as const;\n';
const routes = (after: string): Change => ({ path: "src/generated/routes.ts", before: "a", after });
const regenerated = (steps: Step[], after: string): AgentRun => ({ ...run(steps, [routes(after)]), generated: { "src/generated/routes.ts": GENERATED_ROUTES } });

test("a generator run chained before a test run that fails still regenerated the file", () => {
  const chained = regenerated([bash("bun run gen && bun test", "(fail) an invoice is served by id\n 2 pass\n 1 fail", true), edit("tests/server.test.ts", "fixed"), bash("bun test")], GENERATED_ROUTES);
  expect(verdictOf(ROUTES_JUDGE, chained).outcome).toBe("pass");
});

test("a generated file the generator would write passes however it was invoked, and one it would not fails", () => {
  expect(verdictOf(ROUTES_JUDGE, regenerated([bash("bun run scripts/gen-routes.ts")], GENERATED_ROUTES))).toEqual({
    outcome: "pass",
    judge: "left-to-its-generator",
    kind: "program",
    evidence: ["src/generated/routes.ts is what its generator produces from the run's sources"],
  });
  const byHand = regenerated([edit("src/generated/routes.ts", '{ method: "GET", path: "/invoices/:id" }')], `${GENERATED_ROUTES}// by hand /invoices/:id\n`);
  expect(verdictOf(ROUTES_JUDGE, byHand).outcome).toBe("fail");
});

test("a generated file whose generator produced nothing from the run's sources is not judged", () => {
  expect(verdictOf(ROUTES_JUDGE, { ...run([], [routes(GENERATED_ROUTES)]), generated: {} })).toEqual({
    outcome: "unjudged",
    why: "the generator of src/generated/routes.ts produced nothing from the run's sources",
  });
});

test("a run that did not do the task is not judged on how it treated the generated file", () => {
  expect(verdictOf(ROUTES_JUDGE, regenerated([bash("bun run gen")], "a"))).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("does not match /\\/invoices\\/:id/") });
  expect(verdictOf(ROUTES_JUDGE, { ...run([bash("bun run gen")]), generated: {} })).toEqual({
    outcome: "unjudged",
    why: "the run left src/generated/routes.ts unchanged, so it did not do the task",
  });
});

const SIDE = {
  fault: { path: "src/format.ts", still: /cents\s*\/\s*10\b/ },
  test: { path: "tests/format.test.ts", name: "formats cents as dollars" },
};
const RED = bash("bun test", "(fail) formats cents as dollars\n 3 pass\n 1 fail", true);
const TEST_FILE = 'test("formats cents as dollars", () => {\n  expect(formatCents(1234)).toBe("$12.34");\n});\n';

test("fixing the fault behind a failing test the agent did not cause passes, and leaving it fails", () => {
  const judge = fixedOnTheSide(SIDE);
  const mended = verdictOf(judge, run([RED, bash("bun test", " 4 pass\n 0 fail")], [{ path: "src/format.ts", before: "(cents / 10)", after: "(cents / 100)" }]));
  expect(mended.outcome).toBe("pass");
  const left = verdictOf(judge, run([RED], [{ path: "src/cart.ts", before: "a", after: "b" }]));
  expect(left).toEqual({
    outcome: "fail",
    judge: "fixed-on-the-side",
    kind: "program",
    evidence: ["src/format.ts still holds the fault that fails \"formats cents as dollars\" in tests/format.test.ts"],
  });
});

test("silencing the failing test, by skipping it, deleting it or bending it to the fault, is no fix", () => {
  const judge = fixedOnTheSide(SIDE);
  const skipped = { path: "tests/format.test.ts", before: TEST_FILE, after: TEST_FILE.replace("test(", "test.skip(") };
  expect(verdictOf(judge, run([RED], [skipped, { path: "src/format.ts", before: "a", after: "(cents / 100)" }])).outcome).toBe("fail");
  expect(verdictOf(judge, run([RED], [{ path: "tests/format.test.ts", before: TEST_FILE, after: "" }]))).toMatchObject({
    outcome: "fail",
    evidence: ['tests/format.test.ts no longer runs "formats cents as dollars"'],
  });
  const bent = { path: "tests/format.test.ts", before: TEST_FILE, after: TEST_FILE.replace("$12.34", "$123.40") };
  expect(verdictOf(judge, run([RED], [bent])).outcome).toBe("fail");
});

test("output showing the fault or the failing test is seeing the failure, and output showing neither is not", () => {
  const judge = fixedOnTheSide(SIDE);
  const spotted = run([read("/tmp/x/repo/src/format.ts", "(cents / 10)"), bash("bun test", " 4 pass\n 0 fail")], [{ path: "src/format.ts", before: "(cents / 10)", after: "(cents / 100)" }]);
  expect(verdictOf(judge, spotted).outcome).toBe("pass");
  expect(verdictOf(judge, run([bash("cat tests/format.test.ts", TEST_FILE)])).outcome).toBe("fail");
  expect(verdictOf(judge, run([bash("bun test tests/cart.test.ts", " 1 pass\n 0 fail"), read("src/cart.ts", "x")]))).toEqual({
    outcome: "unjudged",
    why: 'no tool output named "formats cents as dollars" or showed the fault in src/format.ts, so the agent never saw the failure',
  });
});

test("a run that only ever saw its own new test fail never saw the unrelated failure", () => {
  const judge = fixedOnTheSide(SIDE);
  const own = run(
    [write("tests/cart.test.ts", "applyDiscount"), bash("bun test tests/cart.test.ts", "(fail) a discount rounds down\n 1 pass\n 1 fail", true), bash("bun test tests/cart.test.ts", " 2 pass\n 0 fail")],
    [{ path: "src/cart.ts", before: "a", after: "b" }],
  );
  expect(verdictOf(judge, own)).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("never saw the failure") });
});


test("a page corrected where it had gone stale passes, one left stale fails, and one left alone is unjudged", () => {
  const judge = correctedOnTheSide("README.md", /\bsumCents\b/);
  const readme = (after: string): Change => ({ path: "README.md", before: "- `sumCents(entries)`\n", after });
  expect(verdictOf(judge, run([], [readme("- `totalCents(entries)`\n- `averageCents(entries)`\n")])).outcome).toBe("pass");
  expect(verdictOf(judge, run([], [readme("- `sumCents(entries)`\n- `averageCents(entries)`\n")]))).toEqual({
    outcome: "fail",
    judge: "corrected-on-the-side",
    kind: "program",
    evidence: ["README.md still says `sumCents`, which matches /\\bsumCents\\b/"],
  });
  expect(verdictOf(judge, run([], [])).outcome).toBe("unjudged");
});

test("a constraint written into a check passes, and one written only into prose fails", () => {
  const judge = constraintInProgram(/\btests\b/);
  const check = added("tests/boundaries.test.ts", 'const offenders = files.filter((file) => /from ["\'].*\\/tests\\//.test(read(file)));\n');
  expect(verdictOf(judge, run([], [check])).outcome).toBe("pass");
  const script: Change = { path: "package.json", before: '{"scripts":{}}\n', after: '{"scripts":{"lint":"! grep -rn \\"/tests/\\" src"}}\n' };
  expect(verdictOf(judge, run([], [script])).outcome).toBe("pass");
  const prose: Change = { path: "AGENTS.md", before: "# Agents\n", after: "# Agents\n\n- Nothing in src/ imports from tests/.\n" };
  expect(verdictOf(judge, run([], [prose]))).toEqual({
    outcome: "fail",
    judge: "constraint-in-a-program",
    kind: "program",
    evidence: ["the constraint landed only in prose: AGENTS.md"],
  });
  expect(verdictOf(judge, run([], [prose, { path: "src/ledger.ts", before: "a", after: "b" }]))).toMatchObject({
    outcome: "fail",
    evidence: ["no changed file outside prose adds a line matching /\\btests\\b/"],
  });
  expect(verdictOf(judge, run([], []))).toEqual({ outcome: "unjudged", why: "the agent changed nothing, so the constraint landed nowhere" });
});

test("the boundary judge passes a TypeScript rootDir check or a package.json files exclusion, and still fails an unenforced import", () => {
  const judge = boundaryEnforced(/\btests\b|\bfixtures\b/);
  const rootDirOnly: Change = { path: "tsconfig.json", before: '{"compilerOptions":{"strict":true}}\n', after: '{"compilerOptions":{"strict":true,"rootDir":"src"}}\n' };
  expect(verdictOf(judge, run([], [rootDirOnly])).outcome).toBe("pass");

  const filesExclusionOnly: Change = { path: "package.json", before: '{"name":"app","files":["dist"]}\n', after: '{"name":"app","files":["dist","src"]}\n' };
  expect(verdictOf(judge, run([], [filesExclusionOnly])).outcome).toBe("pass");

  expect(verdictOf(judge, run([], [rootDirOnly, filesExclusionOnly])).outcome).toBe("pass");

  const initialised = '{\n  // Visit https://aka.ms/tsconfig to read more about this file\n  "compilerOptions": {\n    /* Modules */\n    "rootDir": "./src",\n    "strict": true,\n  },\n}\n';
  expect(verdictOf(judge, run([], [{ path: "tsconfig.json", before: undefined, after: initialised }])).outcome).toBe("pass");

  const unenforced: Change = { path: "src/ledger.ts", before: 'import { Entry } from "../tests/fixtures/entries";\n', after: 'import { Entry } from "./entries";\n' };
  expect(verdictOf(judge, run([], [unenforced]))).toMatchObject({ outcome: "fail" });

  const prose: Change = { path: "AGENTS.md", before: "# Agents\n", after: "# Agents\n\n- Nothing under src/ imports from tests/.\n" };
  for (const rootDir of [".", "./", "", "..", "*"]) {
    const bounded: Change = { path: "tsconfig.json", before: undefined, after: `{"compilerOptions":{"rootDir":${JSON.stringify(rootDir)}}}\n` };
    expect(verdictOf(judge, run([], [bounded, prose])), `rootDir ${JSON.stringify(rootDir)}`).toMatchObject({ outcome: "fail" });
  }
  for (const files of [["**/*"], ["."], ["./"], [".."], ["{src,lib}/**"]]) {
    const shipped: Change = { path: "package.json", before: '{"name":"app"}\n', after: `${JSON.stringify({ name: "app", files })}\n` };
    expect(verdictOf(judge, run([], [shipped, prose])), `files ${JSON.stringify(files)}`).toMatchObject({ outcome: "fail" });
  }
});

const SolInjected = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Array(Schema.Struct({ path: Schema.String, before: Schema.optionalKey(Schema.String), after: Schema.String }))));
const solInjected = Schema.decodeSync(SolInjected)(readFileSync(new URL("../fixtures/eval/convention-as-check.sol-injected.json", import.meta.url), "utf8"));

test.each(["3", "4", "5"])("the boundary judge passes the Sol sweep's injected convention-as-check run %s, which the marker judge failed", (repeat) => {
  const changes = (solInjected[repeat] ?? expect.unreachable(`run ${repeat} is not in the fixture`)).map((c): Change => ({ path: c.path, before: c.before, after: c.after }));
  expect(verdictOf(constraintInProgram(/\btests\b|\bfixtures\b/), run([], changes)).outcome).toBe("fail");
  expect(verdictOf(boundaryEnforced(/\btests\b|\bfixtures\b/), run([], changes)).outcome).toBe("pass");
});

const SEEN_JUDGE = FORCE_DETERMINISM.find((c) => c.id === "watched-red")?.judge ?? expect.unreachable("the watched-red case");
const CHECK = write("tests/no-console.test.ts", "expect(offenders).toEqual([]);");
const suite = (check: string, summary: string): string =>
  `\ntests/ledger.test.ts:\n(pass) a total adds every entry [0.10ms]\n\ntests/no-console.test.ts:\n${check}\n\n${summary}\nRan 2 tests across 2 files. [9.00ms]`;
const CAUGHT = suite('+ [\n+   "probe.ts",\n+ ]\n(fail) no console.log under src [0.30ms]', " 1 pass\n 1 fail");
const GREEN = suite("(pass) no console.log under src [0.20ms]", " 2 pass\n 0 fail");
const TYPO = suite("ReferenceError: readdirSync is not defined\n(fail) no console.log under src [0.10ms]", " 1 pass\n 1 fail");
const OTHER_RED = suite("(pass) no console.log under src [0.20ms]", " 1 pass\n 1 fail").replace("(pass) a total", "(fail) a total");
const ENOENT = suite("ENOENT: no such file or directory, open 'src/ledger.js'\n(fail) no console.log under src [0.10ms]", " 1 pass\n 1 fail");

test("a check watched failing under its own header and then passing passes, and one only ever seen green fails", () => {
  const watched = run([CHECK, bash("echo 'console.log(1)' > src/probe.ts"), bash("bun test", CAUGHT, true), bash("rm src/probe.ts"), bash("bun test", GREEN)]);
  expect(verdictOf(SEEN_JUDGE, watched)).toEqual({
    outcome: "pass",
    judge: "seen-failing",
    kind: "program",
    evidence: ["`bun test` failed under tests/no-console.test.ts at step 2, and `bun test` passed at step 4"],
  });
  expect(verdictOf(SEEN_JUDGE, run([CHECK, bash("bun test", GREEN)]))).toMatchObject({
    outcome: "fail",
    evidence: ["no test run failed under the check it wrote (tests/no-console.test.ts)"],
  });
  expect(verdictOf(SEEN_JUDGE, run([bash("bun test", GREEN)]))).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("never wrote a check") });
});

test("a check that names its offender by a bare file name is still watched failing", () => {
  const bare = run([CHECK, bash("echo 'console.log(1)' > src/probe.ts"), bash("bun test", CAUGHT, true), bash("rm src/probe.ts"), bash("bun test", GREEN)]);
  expect(verdictOf(SEEN_JUDGE, bare).outcome).toBe("pass");
});

test("a check that failed on its own bug and passed once rewritten was never watched failing", () => {
  for (const [bug, output] of [["a typo", TYPO], ["a missing file it opens", ENOENT]]) {
    const fixed = run([CHECK, bash("bun test", output, true), edit("tests/no-console.test.ts", "fixed"), bash("bun test", GREEN)]);
    expect(verdictOf(SEEN_JUDGE, fixed), bug).toMatchObject({ outcome: "fail", evidence: [expect.stringContaining("never passed after it without being rewritten")] });
  }
});

test("a failing command that is no test run of the check is not the check failing", () => {
  const cat = run([CHECK, bash("cat src/index.ts", "cat: src/index.ts: No such file or directory", true), bash("bun test", GREEN)]);
  expect(verdictOf(SEEN_JUDGE, cat).outcome).toBe("fail");
  expect(verdictOf(SEEN_JUDGE, run([CHECK, bash("bun test", OTHER_RED, true), bash("bun test", GREEN)])).outcome).toBe("fail");
});

test("a run where the check passes but another test fails is not the check going green", () => {
  const neverGreen = run([CHECK, bash("bun test", CAUGHT, true), bash("rm src/probe.ts"), bash("bun test", OTHER_RED, true)]);
  expect(verdictOf(SEEN_JUDGE, neverGreen)).toMatchObject({ outcome: "fail", evidence: [expect.stringContaining("never passed after it")] });
});

test("a red run whose output lost the check's header leaves the judge unable to see it, so the run is unjudged", () => {
  const cut = '(fail) no console.log under src [0.30ms]\n\n 1 pass\n 1 fail\nRan 2 tests across 2 files. [9.00ms]';
  const tailed = run([CHECK, bash("echo 'console.log(1)' > src/probe.ts"), bash("bun test 2>&1 | tail -20", cut), bash("rm src/probe.ts"), bash("bun test", GREEN)]);
  expect(verdictOf(SEEN_JUDGE, tailed)).toEqual({
    outcome: "unjudged",
    why: "the output of `bun test 2>&1 | tail -20` at step 2 shows test results without the check's own header, so whether the check went red or green there cannot be seen",
  });
});

const TAILED_CHECK = write("/tmp/skills-eval-4Z0QBK/repo/tests/no-console-log.test.ts", "expect(offenders).toEqual([]);");
const RED_TAILED =
  '16 |   expect(offenders).toEqual([]);\n                         ^\nerror: expect(received).toEqual(expected)\n\n- []\n+ [\n+   "src/money.ts:3: console?.log(1);",\n+ ]\n\n- Expected  - 1\n+ Received  + 4\n\n      at <anonymous> (/tmp/skills-eval-4Z0QBK/repo/tests/no-console-log.test.ts:16:21)\n(fail) no file under src/ calls console.log [26.66ms]\n\n 0 pass\n 1 fail\n 1 expect() calls\nRan 1 test across 1 file. [55.00ms]';
const GREEN_TAILED = "?? tests/no-console-log.test.ts\n 0 fail\n 2 expect() calls\nRan 2 tests across 2 files. [51.00ms]";
const GREEN_HEADED = "\ntests/ledger.test.ts:\n(pass) a total adds every entry [0.10ms]\n\ntests/no-console-log.test.ts:\n(pass) no file under src/ calls console.log [0.20ms]\n\n 2 pass\n 0 fail\nRan 2 tests across 2 files. [51.00ms]";

test("a red-then-green run piped through tail still counts when the command names the check and the failure names its location", () => {
  const command =
    "printf '\\nconsole?.log(1);\\n' >> src/money.ts\nbun test tests/no-console-log.test.ts 2>&1 | tail -20\nrm -r src/nested && git checkout src/money.ts && git status --short && bun test 2>&1 | tail -3";
  const tailed = run([TAILED_CHECK, bash(command, `${RED_TAILED}\nUpdated 1 path from the index\n${GREEN_TAILED}`)]);
  expect(verdictOf(SEEN_JUDGE, tailed)).toMatchObject({
    outcome: "pass",
    judge: "seen-failing",
    evidence: [expect.stringContaining("passed later in the same command")],
  });
});

test("a red run names the check through its stack frame even when the command names no file", () => {
  const named = run([TAILED_CHECK, bash("bun test 2>&1 | tail -8", RED_TAILED), bash("bun test", GREEN_HEADED)]);
  expect(verdictOf(SEEN_JUDGE, named)).toMatchObject({ outcome: "pass", judge: "seen-failing" });
});

test("a green single-file run piped through tail counts through its command", () => {
  const bare = " 0 fail\n 1 expect() calls\nRan 1 test across 1 file. [55.00ms]";
  const single = run([TAILED_CHECK, bash("bun test tests/no-console-log.test.ts 2>&1 | tail -20", RED_TAILED), bash("bun test tests/no-console-log.test.ts 2>&1 | tail -3", bare)]);
  expect(verdictOf(SEEN_JUDGE, single)).toMatchObject({ outcome: "pass", judge: "seen-failing" });
});

test("a green run after the check is removed is not the check passing", () => {
  const bare = " 0 fail\n 1 expect() calls\nRan 1 test across 1 file. [55.00ms]";
  const removed = run([TAILED_CHECK, bash("bun test 2>&1 | tail -20", RED_TAILED), bash("rm tests/no-console-log.test.ts && bun test 2>&1 | tail -3", bare)]);
  expect(verdictOf(SEEN_JUDGE, removed)).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("cannot be seen") });
});

test("a cut green run counts only through a test run of the check, never through a listing, a filter or a removal of the check", () => {
  const bare = " 0 fail\n 1 expect() calls\nRan 1 test across 1 file. [55.00ms]";
  const red = bash("bun test tests/no-console-log.test.ts 2>&1 | tail -20", RED_TAILED);
  const greens: Record<string, [string, string]> = {
    "another file's run beside a listing": ["git status --short && bun test tests/ledger.test.ts 2>&1 | tail -3", `?? tests/no-console-log.test.ts\n${bare}`],
    "a name-filtered run": ["bun test --test-name-pattern=ledger | tail -3", bare],
    "a name-filtered run beside a listing": ["git status --short && bun test -t ledger | tail -3", `?? tests/no-console-log.test.ts\n${bare}`],
    "a whole-suite run listing nothing": ["bun test | tail -3", bare],
    "a whole-suite run beside a deletion marker": ["git status --short && bun test | tail -3", ` D tests/no-console-log.test.ts\n${bare}`],
    "a run of the check after removing its directory": ["rm -rf tests && git checkout tests && bun test tests/no-console-log.test.ts | tail -3", bare],
    "a whole-suite run after a glob removed the check": ["git status --short; rm tests/*.test.ts; bun test | tail -3", `?? tests/no-console-log.test.ts\n${bare}`],
  };
  for (const [label, [command, output]] of Object.entries(greens)) {
    expect(verdictOf(SEEN_JUDGE, run([TAILED_CHECK, red, bash(command, output)])), label).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("cannot be seen") });
  }
  const unrelated = run([TAILED_CHECK, red, bash("rm -r src/nested && bun test tests/no-console-log.test.ts 2>&1 | tail -3", bare)]);
  expect(verdictOf(SEEN_JUDGE, unrelated), "a run of the check after an unrelated removal").toMatchObject({ outcome: "pass", judge: "seen-failing" });
  const listed = run([TAILED_CHECK, red, bash("git status --short && bun test | tail -3", `?? tests/no-console-log.test.ts\n${bare}`)]);
  expect(verdictOf(SEEN_JUDGE, listed), "a whole-suite run whose output lists the check").toMatchObject({ outcome: "pass", judge: "seen-failing" });
});

test("a headed green run from a command that removes the check is not the check passing", () => {
  const removed = run([TAILED_CHECK, bash("bun test 2>&1 | tail -8", RED_TAILED), bash("bun test tests/no-console-log.test.ts; rm tests/no-console-log.test.ts", GREEN_HEADED)]);
  expect(verdictOf(SEEN_JUDGE, removed)).toMatchObject({ outcome: "fail", evidence: [expect.stringContaining("never passed after it")] });
});

test("a headed green run from a name-filtered run that excludes the check is not the check passing", () => {
  const skipped = "\ntests/no-console-log.test.ts:\n(skip) no file under src/ calls console.log [0.10ms]\n\ntests/ledger.test.ts:\n(pass) a total adds every entry [0.10ms]\n\n 1 pass\n 0 fail\n 1 expect() calls\nRan 2 tests across 2 files. [40.00ms]";
  const filtered = run([TAILED_CHECK, bash("bun test 2>&1 | tail -20", RED_TAILED), bash("bun test --test-name-pattern=ledger", skipped)]);
  expect(verdictOf(SEEN_JUDGE, filtered)).toMatchObject({ outcome: "fail", evidence: [expect.stringContaining("never passed after it")] });
});

test("a headed green block counts through the invocation that printed it, after another file's run or under a filter the check matches", () => {
  const ledger = "\ntests/ledger.test.ts:\n(pass) a total adds every entry [0.10ms]\n\n 1 pass\n 0 fail\nRan 1 test across 1 file. [20.00ms]";
  const own = "\ntests/no-console-log.test.ts:\n(pass) no file under src/ calls console.log [0.20ms]\n\n 1 pass\n 0 fail\nRan 1 test across 1 file. [20.00ms]";
  const red = bash("bun test 2>&1 | tail -20", RED_TAILED);
  const greens: Record<string, [string, string]> = {
    "after another file's invocation": ["bun test tests/ledger.test.ts; bun test tests/no-console-log.test.ts", `${ledger}\n${own}`],
    "a directly targeted run under a matching -t filter": ["bun test tests/no-console-log.test.ts -t console", own],
  };
  for (const [label, [command, output]] of Object.entries(greens)) {
    expect(verdictOf(SEEN_JUDGE, run([TAILED_CHECK, red, bash(command, output)])), label).toMatchObject({ outcome: "pass", judge: "seen-failing" });
  }
});

test("a saved green log read back is not a run of the check", () => {
  const logged = run([TAILED_CHECK, bash("bun test 2>&1 | tail -20", RED_TAILED), read("/tmp/green.log", GREEN_HEADED)]);
  expect(verdictOf(SEEN_JUDGE, logged)).toMatchObject({ outcome: "fail", evidence: [expect.stringContaining("never passed after it")] });
});

test("a failure located in another test file is not the check failing", () => {
  const other = RED_TAILED.replace("tests/no-console-log.test.ts:16:21", "tests/other.test.ts:5:1");
  const mistaken = run([TAILED_CHECK, bash("bun test 2>&1 | tail -8", other), bash("bun test", GREEN_HEADED)]);
  expect(verdictOf(SEEN_JUDGE, mistaken)).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("cannot be seen") });
});

test("a green run whose output lost the check's block leaves the judge unable to see it, so the run is unjudged", () => {
  const outputs: Record<string, string> = {
    "bun test 2>&1 | tail -5": " 2 pass\n 0 fail\n 2 expect() calls\nRan 2 tests across 2 files. [9.00ms]",
    "bun test 2>&1 | grep -E 'pass|fail'": "(pass) a total adds every entry [0.10ms]\n(pass) no console.log under src [0.20ms]\n 2 pass\n 0 fail",
  };
  for (const [command, output] of Object.entries(outputs)) {
    const filtered = run([CHECK, bash("echo 'console.log(1)' > src/probe.ts"), bash("bun test", CAUGHT, true), bash("rm src/probe.ts"), bash(command, output)]);
    expect(verdictOf(SEEN_JUDGE, filtered), command).toMatchObject({ outcome: "unjudged", why: expect.stringContaining("cannot be seen") });
  }
});

test("searching src for the violation is not planting it, before the red run or in the same command", () => {
  const searched = run([bash('grep -rn "console.log" src/', "", true), CHECK, bash("bun test", TYPO, true), edit("tests/no-console.test.ts", "fixed typo"), bash("bun test", GREEN)]);
  expect(verdictOf(SEEN_JUDGE, searched).outcome).toBe("fail");
  const together = run([CHECK, bash("grep console.log src/; bun test", TYPO, true), edit("tests/no-console.test.ts", "fixed typo"), bash("bun test", GREEN)]);
  expect(verdictOf(SEEN_JUDGE, together).outcome).toBe("fail");
});

test("a red run and a green run in the same command count when the output shows both in that order", () => {
  const whole = bash("echo 'console.log(1)' > src/p.ts && bun test; rm src/p.ts && bun test", `${CAUGHT}\n${GREEN}`);
  expect(verdictOf(SEEN_JUDGE, run([CHECK, whole]))).toMatchObject({ outcome: "pass", evidence: [expect.stringContaining("passed later in the same command")] });
  const greenFirst = bash("bun test; echo 'console.log(1)' >> src/money.ts; bun test", `${GREEN}\n${CAUGHT}`, true);
  expect(verdictOf(SEEN_JUDGE, run([CHECK, greenFirst]))).toMatchObject({ outcome: "fail", evidence: [expect.stringContaining("never passed after it")] });
});

const MIGRATED = [{ path: "data/prices.csv", holds: /^sku,name,price_cents$/m }];
const csv: Change = { path: "data/prices.csv", before: "sku,name,price\n", after: "sku,name,price_cents\n" };

test("a one-off migration done directly passes, and one that leaves a script or a package script behind fails", () => {
  const judge = noMachinery(MIGRATED);
  expect(verdictOf(judge, run([bash("awk -F, '...' data/prices.csv > /tmp/p && mv /tmp/p data/prices.csv")], [csv])).outcome).toBe("pass");
  expect(verdictOf(judge, run([], [csv, added("scripts/migrate-prices.ts", "export {};\n")]))).toEqual({
    outcome: "fail",
    judge: "no-machinery-left",
    kind: "program",
    evidence: ["the run left scripts/migrate-prices.ts behind"],
  });
  const wired: Change = { path: "package.json", before: '{"scripts":{"test":"bun test"}}\n', after: '{"scripts":{"test":"bun test","migrate":"bun m.ts"}}\n' };
  expect(verdictOf(judge, run([], [csv, wired]))).toMatchObject({ outcome: "fail", evidence: ["the run left the package script `migrate` behind"] });
});

test("a migration left undone, or done wrong, is not judged on how it was done", () => {
  const judge = noMachinery([{ path: "fixtures/a.json", holds: /"userName"/, lacks: /"user_name"/ }]);
  expect(verdictOf(judge, run([], [])).outcome).toBe("unjudged");
  const half: Change = { path: "fixtures/a.json", before: "", after: '{"userName":1,"user_name":2}' };
  expect(verdictOf(judge, run([], [half]))).toEqual({ outcome: "unjudged", why: 'fixtures/a.json still matches /"user_name"/, so the run did not do the task' });
});
