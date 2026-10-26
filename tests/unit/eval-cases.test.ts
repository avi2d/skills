import { expect, test } from "bun:test";
import { Duration, Effect } from "effect";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES } from "../../evals/cases";
import { delivered } from "../../evals/cases/fixture";
import { bytesOf } from "../../src/eval/eval-transcript";
import { carriageOf, piArgs } from "../../src/eval/eval-pi";
import { PREAMBLE, carriage } from "../../src/dispatcher/dispatch";
import { indexFor } from "../../src/generate/dispatch-index";
import { KIND_DIRS, LIBRARY, SKILL_FILE, bodyDir, loadBodies } from "../../src/bodies/bodies";
import { MalformedBody } from "../../src/platform/failures";
import { REPO } from "../../src/generate/link";
import { refused } from "../../src/dispatcher/comments";
import { reads } from "../../src/dispatcher/forbid";
import { failureOf, valueOf } from "../lib/effect";
import { run } from "../lib/eval-run";
import { verdictOf, type Change } from "../../src/eval/eval-judges";
import { FIXTURES } from "../../evals/cases/utility/right-size-the-work";
import { proseOf } from "../../evals/prose";
import { sweepOf } from "../../src/eval/ablation";

const pastRules = CASES.flatMap((c) => (c.delivery?.kind === "rule-as-of" ? [{ name: c.rule, ...c.delivery }] : []));
const rules = [...new Set(CASES.filter((c) => delivered(c, "injected").carried === "rule" && c.delivery?.kind !== "rule-as-of").map((c) => c.rule))];
const referenceSubjects = [...new Set(CASES.filter((c) => delivered(c, "injected").carried !== "rule").map((c) => c.rule))];
const pastSubjects = [...new Set(pastRules.map((past) => past.name))];

test("the text a sweep injects for a rule is the text the pi Dispatcher injects for it alone", async () => {
  const index = await valueOf(indexFor("pi", await valueOf(loadBodies(REPO))));
  for (const rule of rules) {
    const dispatched = carriage(index, [rule]);
    expect(dispatched, `${rule} does not reach the pi Dispatcher`).toBeDefined();
    expect(await valueOf(carriageOf(REPO, "rule", rule)), rule).toBe(dispatched ?? "");
  }
});

test("a carried Reference reaches the injected arm as its body under the Dispatcher's preamble, without its frontmatter", async () => {
  const carried = await valueOf(carriageOf(REPO, "reference", "plain-sentences"));
  expect(carried.startsWith(`${PREAMBLE}\n\n# Plain sentences\n`)).toBe(true);
  expect(carried).toContain("## Split a long sentence");
  expect(carried).not.toContain("kind: reference");
});

test("a sweep's prose fingerprint includes the Reference whose text the injected arm can load", async () => {
  const dirs = await valueOf(Effect.all([bodyDir(REPO, "rule", "agent-docs"), bodyDir(REPO, "reference", "writing-for-agents")]));
  expect(Object.keys(proseOf(REPO, dirs).files)).toEqual(["library/writing/rules/agent-docs/SKILL.md", "library/writing/references/writing-for-agents/SKILL.md"]);
  const rule = await valueOf(bodyDir(REPO, "rule", "comment-discipline"));
  expect(Object.keys(proseOf(REPO, [rule]).files)).toEqual(["library/engineering/rules/comment-discipline/SKILL.md"]);
});

test("arms with no reference keep the exact original pi prompt and skill flags", () => {
  const agent = { pi: "pi", model: "faux/scripted", thinking: "high", extensions: ["carry.ts"], timeout: Duration.seconds(30) };
  expect(piArgs(agent, "write the README")).toEqual([
    "--mode", "json", "--print", "--no-session", "--no-extensions", "--extension", "carry.ts", "--no-skills",
    "--no-prompt-templates", "--no-themes", "--no-context-files", "--offline", "--model", "faux/scripted", "--thinking", "high", "--", "write the README",
  ]);
  expect(piArgs(agent, "write the README", ["/tmp/home/.pi/agent/skills/unslop/SKILL.md"])).toContain("/tmp/home/.pi/agent/skills/unslop/SKILL.md");
});

test("a Rule whose frontmatter fence is malformed fails the sweep's carriage as a MalformedBody naming the Rule, not as a defect", async () => {
  const repo = `${mkdtempSync(join(realpathSync(tmpdir()), "skills-eval-carriage-"))}/`;
  const dir = `${LIBRARY}/a-domain/${KIND_DIRS.rule}/a-rule`;
  try {
    mkdirSync(`${repo}${dir}`, { recursive: true });
    for (const { text, message } of [
      { text: "# Body\n", message: "does not open with a --- frontmatter fence" },
      { text: "---\nname: a-rule\n\n# Body\n", message: "opens a --- frontmatter fence and never closes it" },
    ]) {
      writeFileSync(`${repo}${dir}/${SKILL_FILE}`, text);
      const found = await failureOf(carriageOf(repo, "rule", "a-rule"));
      expect(found, message).toBeInstanceOf(MalformedBody);
      expect(found).toHaveProperty("message", `${dir}: ${message}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a Reference case ablates the Reference and the References it names alongside, while a Rule case ablates only the Rule and leaves its References reachable in both arms", () => {
  expect(delivered({ rule: "comment-discipline" }, "injected")).toEqual({ carried: "rule", references: [] });
  expect(delivered({ rule: "comment-discipline" }, "withheld")).toEqual({ carried: undefined, references: [] });
  const writing = { rule: "writing-for-people", delivery: { kind: "rule", references: ["technical-writing"] } } as const;
  expect(delivered(writing, "injected")).toEqual({ carried: "rule", references: ["technical-writing"] });
  expect(delivered(writing, "withheld")).toEqual({ carried: undefined, references: ["technical-writing"] });
  expect(delivered({ rule: "unslop", delivery: { kind: "reference" } }, "injected")).toEqual({ carried: undefined, references: ["unslop"] });
  expect(delivered({ rule: "unslop", delivery: { kind: "reference" } }, "withheld")).toEqual({ carried: undefined, references: [] });
  const split = { rule: "unslop", delivery: { kind: "reference", alongside: ["punctuation"] } } as const;
  expect(delivered(split, "injected")).toEqual({ carried: undefined, references: ["unslop", "punctuation"] });
  expect(delivered(split, "withheld")).toEqual({ carried: undefined, references: [] });
  const past = { rule: "prove-it-works-test-first", delivery: { kind: "rule-as-of", of: "prove-it-works", commit: "ca24440" } } as const;
  expect(delivered(past, "injected")).toEqual({ carried: "rule", references: [] });
  expect(delivered(past, "withheld")).toEqual({ carried: undefined, references: [] });
});

test("a carried Reference case puts the Reference's text in the injected arm alone and offers no skill in either arm", () => {
  const carried = { rule: "punctuation", delivery: { kind: "carried" } } as const;
  expect(delivered(carried, "injected")).toEqual({ carried: "reference", references: [] });
  expect(delivered(carried, "withheld")).toEqual({ carried: undefined, references: [] });
});

test("a Reference case is swept, and so pooled, under the Reference rather than under the Rule that points at it", () => {
  const casesOf = (name: string): string[] => {
    const sweep = sweepOf(CASES, { rules: [name], cases: "all", repeats: 1, maxRuns: 100 });
    return "refused" in sweep ? expect.unreachable(sweep.refused) : [...new Set(sweep.cells.map((cell) => cell.case))];
  };
  expect(casesOf("agents-md-router")).toEqual(["release-pointer"]);
  expect(casesOf("writing-for-agents")).toEqual(["writing-for-agents-reference", "positive-target", "lookup-left", "one-source"]);
  expect(casesOf("writing-for-people")).toEqual([
    "en-readme",
    "ru-readme",
    "en-pr",
    "ru-pr",
    "en-site",
    "ru-site",
    "en-errors",
    "ru-errors",
    "en-commit",
    "en-pr-fix",
    "en-readme-flag",
    "en-news",
  ]);
  expect(casesOf("unslop")).toEqual(["copy-edit-overview", "copy-edit-puff", "ru-pr", "en-site-index"]);
  expect(casesOf("punctuation")).toEqual(["en-pr", "en-site", "ru-pr", "ru-errors"]);
});

test("case ids are unique within a rule, and every case is filed under the Rule or Reference it delivers", async () => {
  const bodies = await valueOf(loadBodies(REPO));
  const index = await valueOf(indexFor("pi", bodies));
  expect(rules.filter((rule) => !index.rules.some((r) => r.name === rule))).toEqual([]);
  expect(referenceSubjects.filter((name) => !bodies.some((body) => body.kind === "reference" && body.name === name))).toEqual([]);
  expect(pastRules.filter((past) => !index.rules.some((r) => r.name === past.of) || index.rules.some((r) => r.name === past.name))).toEqual([]);
  const offered = [...new Set(CASES.flatMap((c) => delivered(c, "injected").references))];
  expect(offered.filter((name) => !bodies.some((body) => body.kind === "reference" && body.name === name))).toEqual([]);
  const keys = CASES.map((c) => `${c.rule}/${c.id}`);
  expect(keys.length).toBe(new Set(keys).size);
});

test("no seed repository already holds a comment the comment judge refuses, so every refusal is the agent's", () => {
  let checked = 0;
  for (const c of CASES) {
    for (const [path, text] of Object.entries(c.files)) {
      if (reads("comments", { path, before: { text: () => text, inRepository: () => path } })) {
        checked += 1;
        expect(refused(path, text), `${c.rule}/${c.id}: ${path}`).toEqual([]);
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
});

const ANSWERS: Record<string, { answer: string; times: number }> = {
  "build-log": { answer: "ledger-sync", times: 1 },
  lockfile: { answer: "4.17.21", times: 2 },
};

test("a context-window case's file is far larger than its budget, and holds its answer only in its own entry", () => {
  const cases = CASES.filter((x) => x.rule === "guard-the-context-window");
  expect(cases.map((c) => c.id).toSorted()).toEqual(Object.keys(ANSWERS).toSorted());
  for (const c of cases) {
    const [path, text] = Object.entries(c.files).find(([, t]) => bytesOf(t) > 100_000) ?? [];
    expect(path, `${c.id} seeds no large file, so reading it whole costs nothing`).toBeDefined();
    expect(bytesOf(text ?? ""), `${c.id}: a whole read of ${path} would fit the budget`).toBeGreaterThan(16 * 1024 * 4);
    const { answer, times } = ANSWERS[c.id] ?? { answer: "", times: 0 };
    expect((text ?? "").split(answer).length - 1, `${c.id}: ${path} holds ${answer} somewhere besides its own entry`).toBe(times);
  }
});

test("a run that did nothing is never a pass, so no case can be won by doing nothing", () => {
  for (const c of CASES) expect(verdictOf(c.judge, run([], [])).outcome, `${c.rule}/${c.id}`).toBe("unjudged");
});

const PAGE = "docs/eval-cases.md";
const CASE_ROW = /^\| `([a-z-]+)` \| (.*?) \|/;

test("the eval cases page lists every Rule and every Reference with cases, and says why each Rule without one has none", async () => {
  const index = await valueOf(indexFor("pi", await valueOf(loadBodies(REPO))));
  const page = await Bun.file(`${REPO}${PAGE}`).text();
  const listed = new Map(
    page.split("\n").flatMap((line) => {
      const [, rule, cases] = CASE_ROW.exec(line) ?? [];
      return rule === undefined || cases === undefined ? [] : [[rule, cases === "none" ? [] : cases.split(", ").map((id) => id.replaceAll("`", ""))] as const];
    }),
  );
  expect([...listed.keys()].toSorted()).toEqual([...index.rules.map((rule) => rule.name), ...referenceSubjects, ...pastSubjects].toSorted());
  const unmeasured = page.slice(page.indexOf("## Unmeasured Rules"));
  for (const [rule, ids] of listed) {
    expect(ids, `${PAGE} lists other cases for ${rule} than evals/cases holds`).toEqual(CASES.filter((c) => c.rule === rule).map((c) => c.id));
    if (ids.length > 0) continue;
    const [, why = ""] = unmeasured.split(`### \`${rule}\`\n`);
    expect(why.split("\n## ")[0]?.trim(), `${rule} has no case and ${PAGE} does not say why`).not.toBe("");
  }
});

const asSeeded = (files: Readonly<Record<string, string>>): Change[] => Object.entries(files).map(([path, text]) => ({ path, before: text, after: text }));

test("a case whose judge asks the task to be done does not find it done in the seed", () => {
  for (const id of ["csv-migration", "fixture-rename", "generated-routes"]) {
    const c = CASES.find((x) => x.id === id) ?? expect.unreachable(`no case ${id}`);
    expect(verdictOf(c.judge, run([], asSeeded(c.files))).outcome, id).toBe("unjudged");
  }
  expect(Object.keys(FIXTURES).length).toBeGreaterThan(1);
});
