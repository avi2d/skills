import { expect, test } from "bun:test";
import { CASES } from "../../evals/cases";
import type { EvalCase } from "../../evals/cases/fixture";
import {
  boundedReview,
  plainOverview,
  plainSentences,
  plainWords,
  punctuation,
  releasePointer,
  russianProse,
  whatGoesWhere,
} from "../../evals/writing-judges";
import type { Verdict } from "../../src/eval/ablation";
import { verdictOf, type Change, type ProgramJudge } from "../../src/eval/eval-judges";
import { REPO } from "../../src/generate/link";
import { run } from "../lib/eval-run";

const verdict = (judge: ProgramJudge, path: string, before: string, after: string) => {
  const changes: Change[] = [{ path, before, after }];
  return verdictOf(judge, run([], changes));
};

const judged = (judge: ProgramJudge, path: string, before: string, after: string): string => verdict(judge, path, before, after).outcome;

test("a release pointer passes only when the procedure is left behind it", () => {
  const before = "# Agent notes\n";
  expect(judged(releasePointer, "AGENTS.md", before, `${before}For releases read docs/release.md. Run bun run release:dry.\n`)).toBe("fail");
  expect(judged(releasePointer, "AGENTS.md", before, `${before}For releases read docs/release.md.\n`)).toBe("pass");
  expect(judged(releasePointer, "AGENTS.md", before, `${before}To ship a version, follow docs/release.md.\n`)).toBe("pass");
});

test("a copy edit that keeps the subtler tells fails, and one that clears them passes", () => {
  const before = "# Importing Ledger Entries\n\nThe `bun run import` command serves as the entry point for loading ledger.csv (the export from your bank).\nEach row is validated by the importer, and duplicates are skipped.\n**Duplicates:** Duplicate rows are listed at the end of the run.\n";
  const usual = "# Importing Ledger Entries\n\nThe `bun run import` command serves as the entry point for loading ledger.csv (your bank's export).\nEach row is validated by the importer, and duplicate rows are skipped and listed at the end of the run.\n";
  const found = verdict(plainOverview, "docs/overview.md", before, usual);
  expect(found.outcome).toBe("fail");
  expect("evidence" in found ? found.evidence.map((line) => line.slice(0, line.indexOf(":"))) : []).toEqual([
    "a heading in title case",
    "a fancy way to say \"is\"",
    "a passive sentence whose actor could lead it",
    "a dash, a parenthesis or a semicolon",
  ]);
  expect(judged(plainOverview, "docs/overview.md", before, before.replace("# Importing Ledger Entries", "# Import ledger entries"))).toBe("fail");
  expect(judged(plainOverview, "docs/overview.md", before, "# Import ledger entries\n\n**Duplicates:** the importer lists them after running `bun run import` on ledger.csv.\n")).toBe("fail");
  const plain = "# Import ledger entries\n\nRun `bun run import` to load ledger.csv, the export from your bank.\nThe importer checks each row and skips duplicates.\nIt lists the duplicate rows at the end of the run.\n";
  expect(judged(plainOverview, "docs/overview.md", before, plain)).toBe("pass");
  expect(judged(plainOverview, "docs/overview.md", before, plain.replace("# Import ledger entries", "# Import to Ledger"))).toBe("pass");
  expect(judged(plainOverview, "docs/overview.md", before, "# Import ledger entries\n\nRun the import.\n")).toBe("unjudged");
});

test("a refusal kept only outside VISION.md fails, a duplicated principle fails, and a pointer passes", () => {
  const vision = "# Vision\n\nLedger stays a small explicit tool.\n";
  const refusal = "Plugin support is refused: plugins hide data flow, which breaks the explicit over implicit principle.\n";
  const owned = verdictOf(whatGoesWhere, run([], [{ path: "VISION.md", before: vision, after: `${vision}${refusal}` }]));
  expect(owned.outcome).toBe("pass");
  const stray = verdictOf(
    whatGoesWhere,
    run([], [
      { path: "VISION.md", before: vision, after: `${vision}${refusal}` },
      { path: "README.md", before: "# ledger\n", after: `# ledger\n\n${refusal}` },
    ]),
  );
  expect(stray.outcome).toBe("fail");
  expect(verdictOf(whatGoesWhere, run([], [{ path: "README.md", before: "# ledger\n", after: `# ledger\n\n${refusal}` }])).outcome).toBe("fail");
  expect(verdictOf(whatGoesWhere, run([], [{ path: "AGENTS.md", before: "# Agent notes\n", after: `# Agent notes\n\n${refusal}` }])).outcome).toBe("fail");
  const principle = "Explicit over implicit is our guiding principle.\n";
  const duplicated = verdictOf(
    whatGoesWhere,
    run([], [
      { path: "VISION.md", before: vision, after: `${vision}${refusal}` },
      { path: "AGENTS.md", before: "# Agent notes\n", after: `# Agent notes\n\n${principle}` },
    ]),
  );
  expect(duplicated.outcome).toBe("fail");
  const pointer = verdictOf(
    whatGoesWhere,
    run([], [
      { path: "VISION.md", before: vision, after: `${vision}${refusal}` },
      { path: "AGENTS.md", before: "# Agent notes\n", after: "# Agent notes\n\nFor plugin requests, read VISION.md.\n" },
    ]),
  );
  expect(pointer.outcome).toBe("pass");
  const readmePointer = verdictOf(
    whatGoesWhere,
    run([], [
      { path: "VISION.md", before: vision, after: `${vision}${refusal}` },
      { path: "README.md", before: "# ledger\n", after: "# ledger\n\nFor plugin requests, read VISION.md.\n" },
    ]),
  );
  expect(readmePointer.outcome).toBe("pass");
  const linked = verdictOf(
    whatGoesWhere,
    run([], [
      { path: "VISION.md", before: vision, after: `${vision}${refusal}` },
      { path: "AGENTS.md", before: "# Agent notes\n", after: "# Agent notes\n\nPlugin support is refused: see VISION.md.\n" },
    ]),
  );
  expect(linked.outcome).toBe("fail");
  const readmeLinked = verdictOf(
    whatGoesWhere,
    run([], [
      { path: "VISION.md", before: vision, after: `${vision}${refusal}` },
      { path: "README.md", before: "# ledger\n", after: "# ledger\n\nPlugin support is refused: see VISION.md.\n" },
    ]),
  );
  expect(readmeLinked.outcome).toBe("fail");
  for (const dest of ["AGENTS.md", "README.md"] as const) {
    const before = dest === "AGENTS.md" ? "# Agent notes\n" : "# ledger\n";
    const refusPointer = verdictOf(
      whatGoesWhere,
      run([], [
        { path: "VISION.md", before: vision, after: `${vision}${refusal}` },
        { path: dest, before, after: `${before}For refusal decisions, read VISION.md.\n` },
      ]),
    );
    expect(refusPointer.outcome).toBe("pass");
    const reasonPointer = verdictOf(
      whatGoesWhere,
      run([], [
        { path: "VISION.md", before: vision, after: `${vision}${refusal}` },
        { path: dest, before, after: `${before}Plugins are excluded because they hide data flow. See VISION.md.\n` },
      ]),
    );
    expect(reasonPointer.outcome).toBe("pass");
  }
  expect(verdictOf(whatGoesWhere, run([], [{ path: "VISION.md", before: vision, after: vision }])).outcome).toBe("unjudged");
  expect(verdictOf(whatGoesWhere, run([], [])).outcome).toBe("unjudged");
});

test("vision without the refusal word is unjudged", () => {
  const vision = "# Vision\n\nLedger stays a small explicit tool.\n";
  expect(verdictOf(whatGoesWhere, run([], [{ path: "VISION.md", before: vision, after: `${vision}## Plugin support\n\nExplicit over implicit is our guiding principle.\n` }])).outcome).toBe("unjudged");
});

test("a review step without an end condition fails and a bounded one passes", () => {
  const before = "# Agent notes\n";
  const unbounded = verdict(boundedReview, "AGENTS.md", before, `${before}Run bun test and fix failures.\n`);
  expect(unbounded).toMatchObject({ outcome: "fail", evidence: ["the step has no observable completion criterion for test failures", "Run bun test and fix failures."] });
  expect(judged(boundedReview, "AGENTS.md", before, `${before}Run bun test and fix failures until 0 fail.\n`)).toBe("pass");
  expect(judged(boundedReview, "AGENTS.md", before, `${before}- Review: run the test suite and resolve every failure before finishing a change.\n`)).toBe("pass");
  expect(judged(boundedReview, "AGENTS.md", before, `${before}Run the test suite and resolve failures before finishing a change.\n`)).toBe("fail");
  expect(judged(boundedReview, "AGENTS.md", before, `${before}Run the full \`test\` script and fix the cause of every failure. The change is finished only when the whole suite passes green on your final code.\n`)).toBe("pass");
  expect(judged(boundedReview, "AGENTS.md", before, `${before}Run the test suite with \`bun run test\`. If any tests fail, fix the cause and run the suite again. Only finish once the full suite passes.\n`)).toBe("pass");
  expect(judged(boundedReview, "AGENTS.md", before, `${before}Before finishing, run the full \`test\` script and fix each failure at its cause. The change is done when the whole suite runs green after your final edit.\n`)).toBe("pass");
});

const FIXTURES = `${REPO}tests/fixtures/writing`;

const output = (name: string): Promise<string> => Bun.file(`${FIXTURES}/${name}`).text();

const BY_KEY = new Map(CASES.map((c) => [`${c.rule}/${c.id}`, c]));

const caseOf = (key: string): EvalCase => BY_KEY.get(key) ?? expect.unreachable(`no case ${key}`);

const verdictFor = async (key: string, path: string, fixture: string): Promise<Verdict> => {
  const c = caseOf(key);
  return verdictOf(c.judge, run([], [{ path, before: c.files[path], after: await output(fixture) }]));
};

const tellsOf = (found: Verdict): string[] => ("evidence" in found ? [...new Set(found.evidence.map((line) => line.split(":")[0] ?? line))] : []);

test("plain-sentences fails the unguided site paragraphs on sentences over the 25 words the reference allows, and passes the guided ones", async () => {
  const unguided = await verdictFor("plain-sentences/en-site", "site/about.md", "en-site.unguided.txt");
  expect(unguided.outcome).toBe("fail");
  expect("evidence" in unguided ? unguided.evidence[0] : "").toStartWith("a sentence of 46 words");
  expect((await verdictFor("plain-sentences/ru-site", "site/about.md", "ru-site.unguided.txt")).outcome).toBe("fail");
  expect((await verdictFor("plain-sentences/en-site", "site/about.md", "en-site.guided.txt")).outcome).toBe("pass");
  expect((await verdictFor("plain-sentences/ru-site", "site/about.md", "ru-site.guided.txt")).outcome).toBe("pass");
  expect((await verdictFor("plain-sentences/ru-pr", "PR.md", "ru-pr.guided.txt")).outcome).toBe("pass");
});

test("plain-sentences counts a code span, a number and an identifier as one word each, and reads a list item apart from the lines around it", () => {
  const words = Array.from({ length: 23 }, (_, at) => `w${at}`).join(" ");
  expect(plainSentences([`${words} \`row.amount.toFixed(2)\` 12.50.`])).toEqual([]);
  expect(plainSentences([`${words} \`a\` 12.50 more.`])).toEqual([`a sentence of 26 words, over the 25 the reference allows: ${words} Code 12.50 more.`]);
  expect(plainSentences(["- Ledger reads the file.", "- Ledger reads the bank."])).toEqual([]);
  expect(plainSentences(["Ledger reads the file. Ledger reads the bank."])).toEqual(['two sentences in a row open with "ledger reads": Ledger reads the bank.']);
  expect(plainSentences(["Each row is validated by the importer."])).toEqual(["a passive sentence whose actor could lead it: Each row is validated by the importer."]);
  expect(plainSentences(["Please choose a CSV file."])).toEqual(["an instruction that says please: Please choose a CSV file."]);
});

test("plain-words fails the unguided PR description on its Latin abbreviations and filler and the unguided site paragraph on its idiom, and the guided ones pass", async () => {
  expect(tellsOf(await verdictFor("plain-words/en-pr", "PR.md", "en-pr.unguided.txt"))).toEqual(["a Latin abbreviation", "filler"]);
  expect(tellsOf(await verdictFor("plain-words/en-site", "site/about.md", "en-site.unguided.txt"))).toEqual(["an idiom"]);
  expect((await verdictFor("plain-words/en-pr", "PR.md", "en-pr.guided.txt")).outcome).toBe("pass");
  expect((await verdictFor("plain-words/en-site", "site/about.md", "en-site.guided.txt")).outcome).toBe("pass");
  expect(plainWords(["Run `vs-code` to utilize the editor."])).toEqual(["a long word where a short one does: Run Code to utilize the editor."]);
});

test("punctuation fails the unguided PR descriptions and messages on their dashes, parentheses, slashes and bold labels, and the guided ones pass", async () => {
  expect(tellsOf(await verdictFor("punctuation/en-pr", "PR.md", "en-pr.unguided.txt"))).toEqual(["a dash, a parenthesis or a semicolon", "a slash for and or or"]);
  expect(tellsOf(await verdictFor("punctuation/ru-pr", "PR.md", "ru-pr.unguided.txt"))).toEqual(["a dash, a parenthesis or a semicolon", "a bold label", "a slash for and or or"]);
  expect(tellsOf(await verdictFor("punctuation/ru-errors", "src/messages.json", "ru-errors.unguided.json"))).toEqual(["a dash, a parenthesis or a semicolon"]);
  expect((await verdictFor("punctuation/ru-errors", "src/messages.json", "ru-errors.guided.json")).outcome).toBe("pass");
  expect((await verdictFor("punctuation/ru-pr", "PR.md", "ru-pr.guided.txt")).outcome).toBe("pass");
  expect(punctuation(["Run `src/import.ts` or [the guide](https://example.com/a/b)."])).toEqual([]);
  expect(punctuation(["Pick one or more file(s) with “quotes”, etc."])).toEqual([
    "a dash, a parenthesis or a semicolon: Pick one or more file(s) with “quotes”, etc.",
    "a curly quote: Pick one or more file(s) with “quotes”, etc.",
    "a list ended with etc.: Pick one or more file(s) with “quotes”, etc.",
  ]);
});

test("russian-prose fails the unguided PR description on its infinitive steps and its vs, and the guided one in plural imperatives passes", async () => {
  expect(tellsOf(await verdictFor("russian-prose/ru-pr", "PR.md", "ru-pr.unguided.txt"))).toEqual(['"vs" where a Russian word exists', "a step in the infinitive rather than the plural imperative", "a reflexive passive verb where an actor could lead the sentence"]);
  expect((await verdictFor("russian-prose/ru-pr", "PR.md", "ru-pr.guided.txt")).outcome).toBe("pass");
  expect(russianProse(["Установи зависимости."])).toEqual(["an instruction in the singular imperative: Установи зависимости."]);
  expect(russianProse(["1. Повторно импортировать файл."])).toEqual(["a step in the infinitive rather than the plural imperative: Повторно импортировать файл."]);
  expect(russianProse(["- Часть строк пропущена.", "", "Импортировать выгрузку можно дважды."])).toEqual([]);
  expect(russianProse(["- Подробности импорта в docs.", "- Память не растёт.", "- Пути к файлам не меняются.", "- Части выгрузки идут по порядку."])).toEqual([]);
  expect(russianProse(["- Найти выгрузку.", "- Нести ответственность."])).toEqual([
    "a step in the infinitive rather than the plural imperative: Найти выгрузку.",
    "a step in the infinitive rather than the plural imperative: Нести ответственность.",
  ]);
  expect(russianProse(["- Учесть часовой пояс.", "- Спасти выгрузку.", "- Сесть за отчёт.", "- Новости и власть не меняются."])).toEqual([
    "a step in the infinitive rather than the plural imperative: Учесть часовой пояс.",
    "a step in the infinitive rather than the plural imperative: Спасти выгрузку.",
    "a step in the infinitive rather than the plural imperative: Сесть за отчёт.",
  ]);
  expect(russianProse(["- Попасть в настройки.", "- Съесть.", "- Прорасти.", "- Страсти не утихают."])).toEqual([
    "a step in the infinitive rather than the plural imperative: Попасть в настройки.",
    "a step in the infinitive rather than the plural imperative: Съесть.",
    "a step in the infinitive rather than the plural imperative: Прорасти.",
  ]);
  expect(russianProse(["Раз. Два. Три. Четыре. Пять. Шесть.", "", "Раз. Два. Три. Четыре. Пять. Шесть. Семь."])).toEqual([
    "a paragraph of 7 sentences, over the 6 the reference allows: Раз. Два. Три. Четыре. Пять. Шесть. Семь.",
  ]);
});

test("russian-prose fails a text with more than five reflexive passive verbs and keeps verbs with no actor to lead", async () => {
  expect(russianProse(["Зависимости устанавливаются командой:"])).toEqual([]);
  const passive = [
    "Изменена логика дедупликации в функции `importRows` (`src/import.ts`): вместо использования сырого текста строки `row.raw` в качестве ключа теперь используется нормализованный ключ из трёх полей — даты, суммы и получателя платежа.",
    "Ключ теперь формируется как `дата|сумма|получатель`, где:",
    "сумма приводится к формату с двумя знаками после запятой (`toFixed(2)`),",
    "у получателя (`payee`) обрезаются пробелы по краям и приводится к нижнему регистру.",
    "Добавлен тест `skips a row that differs only in spacing or case of the payee`, который проверяет, что повторная строка с отличиями только в пробелах и регистре получателя (`\"Coffee Shop\"` vs `\" coffee shop \"`) считается дубликатом и пропускается.",
    "Раньше дубликаты определялись по точному совпадению сырого текста строки.",
    "Новый нормализованный ключ решает эту проблему и предотвращает задвоение записей при импорте.",
    "Убедиться, что второй импорт возвращает пустой массив (строка пропущена как дубликат).",
  ];
  const offenses = russianProse(passive).filter((offense) => offense.startsWith("a reflexive passive verb"));
  expect(offenses.length).toBe(4);
  for (const offense of offenses) expect(offense.startsWith("a reflexive passive verb where an actor could lead the sentence: ")).toBe(true);
  expect(tellsOf(await verdictFor("russian-prose/ru-pr", "PR.md", "ru-pr.unguided.txt"))).toEqual([
    '"vs" where a Russian word exists',
    "a step in the infinitive rather than the plural imperative",
    "a reflexive passive verb where an actor could lead the sentence",
  ]);
  expect((await verdictFor("russian-prose/ru-pr", "PR.md", "ru-pr.guided.txt")).outcome).toBe("pass");
  expect(russianProse(Array(5).fill("Ключ теперь формируется как `дата|сумма|получатель`, где:"))).toEqual([]);
  expect(russianProse(Array(6).fill("Ключ теперь формируется как `дата|сумма|получатель`, где:")).length).toBe(1);
});
