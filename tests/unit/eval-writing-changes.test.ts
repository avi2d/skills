import { expect, test } from "bun:test";
import { CASES } from "../../evals/cases";
import type { EvalCase } from "../../evals/cases/fixture";
import { russianProse } from "../../evals/writing-judges";
import type { Verdict } from "../../src/eval/ablation";
import { verdictOf } from "../../src/eval/eval-judges";
import { REPO } from "../../src/generate/link";
import { run } from "../lib/eval-run";

const output = (name: string): Promise<string> => Bun.file(`${REPO}tests/fixtures/writing/${name}`).text();

const BY_KEY = new Map(CASES.map((c) => [`${c.rule}/${c.id}`, c]));

const caseOf = (id: string): EvalCase => BY_KEY.get(`writing-for-people/${id}`) ?? expect.unreachable(`no case ${id}`);

const ruled = (id: string, path: string, after: string): Verdict => {
  const c = caseOf(id);
  return verdictOf(c.judge, run([], [{ path, before: c.files[path], after }]));
};

const tellsOf = (found: Verdict): string[] => ("evidence" in found ? [...new Set(found.evidence.map((line) => line.split(":")[0] ?? line))] : []);

const committedRun = (messages: string[]) => ({ ...run([], []), commits: messages });

const commitVerdict = (messages: string[]): Verdict => verdictOf(caseOf("en-commit").judge, committedRun(messages));

test("writing-for-people reads a commit message across git's wrapped lines, keeps a bare call and a conventional scope out of the prose, and fails the long sentences of the unguided commit", async () => {
  const unguided = commitVerdict([await output("en-commit.unguided.txt")]);
  expect(unguided.outcome).toBe("fail");
  expect(tellsOf(unguided)).toEqual(["a sentence of 30 words, over the 25 the reference allows"]);
  expect(tellsOf(commitVerdict([await output("en-commit.guided-long.txt")]))).toEqual(["a sentence of 26 words, over the 25 the reference allows"]);
  const guided = await output("en-commit.guided.txt");
  expect(commitVerdict([guided]).outcome).toBe("pass");
  expect(commitVerdict([`fix(import): ${guided}`]).outcome).toBe("pass");
  expect(commitVerdict([guided.replace("amount to two decimal places", "amount `toFixed(2)`")]).outcome).toBe("pass");
  expect(tellsOf(commitVerdict([guided.replace("The old key kept both rows.", "The old key (the raw line) kept both rows.")]))).toEqual(["a dash, a parenthesis or a semicolon"]);
  expect(commitVerdict([])).toEqual({ outcome: "unjudged", why: "the run made no commit" });
  for (const dropped of ["Dedupe imports on normalized date, amount and payee\n", guided.replace(" trimmed and", "")]) {
    expect(commitVerdict([dropped]), dropped).toEqual({ outcome: "unjudged", why: "the commit message does not carry the facts the task gave" });
  }
});

test("writing-for-people fails the unguided PR description written after the fix on its long sentences, and passes the guided one", async () => {
  const unguided = ruled("en-pr-fix", "PR.md", await output("en-pr-fix.unguided.txt"));
  expect(unguided.outcome).toBe("fail");
  expect("evidence" in unguided ? unguided.evidence.length : 0).toBe(4);
  expect((ruled("en-pr-fix", "PR.md", await output("en-pr-fix.guided.txt"))).outcome).toBe("pass");
});

test("writing-for-people fails the unguided README flag section on two sentences that open alike, passes the guided page that split the seeded line, and leaves unjudged one that drops what the README held", async () => {
  expect(tellsOf(ruled("en-readme-flag", "README.md", await output("en-readme-flag.unguided.txt")))).toEqual(['two sentences in a row open with "run code"']);
  const guided = await output("en-readme-flag.guided.txt");
  expect(ruled("en-readme-flag", "README.md", guided).outcome).toBe("pass");
  for (const dropped of ["1. Run `bun test`.\n", "1. Run `bun run import <file>`.\n"]) {
    expect(ruled("en-readme-flag", "README.md", guided.replace(dropped, "")), dropped).toEqual({ outcome: "unjudged", why: "README.md dropped what it held before" });
  }
  expect(ruled("en-readme-flag", "README.md", guided.replaceAll(" --dry-run", ""))).toEqual({ outcome: "unjudged", why: "README.md does not carry the facts the task gave" });
});

test("writing-for-people fails the unguided news note on its long sentence, passes the guided one, and reads the paraphrases a real note used for each fact", async () => {
  expect(tellsOf(ruled("en-news", "site/news.md", await output("en-news.unguided.txt")))).toEqual(["a sentence of 28 words, over the 25 the reference allows"]);
  const guided = await output("en-news.guided.txt");
  expect(ruled("en-news", "site/news.md", guided).outcome).toBe("pass");
  for (const [said, paraphrase] of [
    ["imported a payment twice", "counted a payment double"],
    ["says which columns a rejected file is missing", "names the columns a file misses"],
    ["imported a payment twice", "kept one copy of a payment"],
    ["writes nothing to `ledger.csv`", "leaves `ledger.csv` unchanged"],
    ["Ledger 1.3 needs Bun 1.2 or later.", "Before you update Ledger, update `Bun` to 1.2 or later."],
  ] as const) {
    expect(ruled("en-news", "site/news.md", guided.replace(said, paraphrase)).outcome, paraphrase).toBe("pass");
  }
  for (const dropped of ["Ledger 1.3 needs Bun 1.2 or later.\n", "The limit in Ledger 1.2 was 10 MB.\n"]) {
    expect(ruled("en-news", "site/news.md", guided.replace(dropped, "")), dropped).toEqual({ outcome: "unjudged", why: "site/news.md does not carry the facts the task gave" });
  }
});

test("russian-prose reads фиксировать as the Russian verb it is and still flags the slang фикс", () => {
  expect(russianProse(["Заметки разработчиков фиксируют новый предел размера."])).toEqual([]);
  expect(russianProse(["Этот фикс убирает дубли."])).toEqual(['"фикс" where a Russian word exists: Этот фикс убирает дубли.']);
});

test("a message that says the file must be a CSV file carries the NOT_CSV fact", () => {
  const plain = {
    FILE_TOO_LARGE: "The file holds more than 10 MB. Split it by month and import each part.",
    NOT_CSV: "File must be a CSV file.",
    MISSING_COLUMNS: "Add the missing columns {columns} to the file and press Import again.",
    ALREADY_IMPORTED: "Ledger imported every row before on {date}. Nothing was added.",
  };
  expect(ruled("en-errors", "src/messages.json", JSON.stringify(plain)).outcome).toBe("pass");
});
