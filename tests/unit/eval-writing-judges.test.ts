import { expect, test } from "bun:test";
import { CASES } from "../../evals/cases";
import type { EvalCase } from "../../evals/cases/fixture";
import {
  boundedReview,
  docShape,
  firstPerson,
  lookupLeft,
  oneSource,
  opensOnMechanism,
  plainOverview,
  plainSentences,
  plainWords,
  positiveTarget,
  punctuation,
  releasePointer,
  russianProse,
  unslop,
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

const FIVE_PASSIVES = ["Ключ формируется из даты, суммы и получателя.", "Сумма приводится к двум знакам.", "Получатель приводится к нижнему регистру.", "Повторная строка считается дубликатом.", "Дубликат пропускается."];
const sixthIsPassive = (sentence: string): boolean => russianProse([...FIVE_PASSIVES, "", sentence]).some((offense) => offense.startsWith("a reflexive passive verb"));

test("russian-prose counts reflexive forms by suffix, an active one such as завершился too, and leaves verbs used only reflexively, other persons and words that only end in -сь", () => {
  expect(russianProse(FIVE_PASSIVES)).toEqual([]);
  for (const reflexive of [
    "Регистр не учитывается.",
    "Дубликаты определялись по тексту.",
    "Записи сохранялись дважды.",
    "Пробелы убираются.",
    "Ключи хранятся в памяти.",
    "При повторном импорте строка может пропускаться.",
    "Импорт завершился без ошибок.",
    "Операции регистрируются в локальном файле.",
  ]) expect(sixthIsPassive(reflexive)).toBe(true);
  for (const active of [
    "Здесь весь код прежний.",
    "Строки отличались пробелами.",
    "Раньше они различались.",
    "Мне нравится результат.",
    "Не бойся ошибок.",
    "Данные остаются на вашем компьютере.",
    "Это оказалось проще.",
    "Мы учимся на ошибках.",
    "Убедитесь, что импорт прошёл.",
  ]) expect(sixthIsPassive(active)).toBe(false);
});

test("russian-prose counts a passive verb in a repeated sentence each time it appears", () => {
  const repeated = [...FIVE_PASSIVES.slice(0, 4), "Повторная строка пропускается.", FIVE_PASSIVES[1] ?? ""];
  expect(russianProse([repeated.join(" ")])).toEqual(repeated.map((sentence) => `a reflexive passive verb where an actor could lead the sentence: ${sentence}`));
});

test("russian-prose passes the Muse PR description whose five passives sat beside an active отличались", () => {
  const description = [
    "Теперь ключ строится из нормализованных полей, даты, суммы и получателя платежа:",
    "",
    "Добавлен тест в Code: Code, который проверяет, что повторная строка с тем же значением, но другим регистром в Code, считается дубликатом и пропускается.",
    "",
    "Старая логика на Code пропускала дубли, если исходные строки хоть немного отличались форматированием.",
    "",
    "- сумма приводится к единому виду через Code,",
    "- получатель платежа сравнивается без учёта пробелов по краям и регистра.",
  ];
  expect(russianProse(description)).toEqual([]);
});

test("technical-writing fails the unguided READMEs on headings that name a thing and on two sentences to a line, and passes the guided ones", async () => {
  expect(tellsOf(await verdictFor("technical-writing/en-readme", "README.md", "en-readme.unguided.txt"))).toEqual(["a heading names a thing rather than the task"]);
  expect(tellsOf(await verdictFor("technical-writing/ru-readme", "README.md", "ru-readme.unguided.txt"))).toEqual(["a heading names a thing rather than the task", "a line holds 2 sentences"]);
  expect((await verdictFor("technical-writing/en-readme", "README.md", "en-readme.guided.txt")).outcome).toBe("pass");
  expect((await verdictFor("technical-writing/ru-readme", "README.md", "ru-readme.guided.txt")).outcome).toBe("pass");
});

test("technical-writing holds a docs page to a mode in its front matter, a task title, one sentence to a line and text about the subject as it is now", () => {
  const page = docShape([/bun run import/], true);
  const shaped = ["---", "kind: how-to", "---", "# Import a bank export", "", "Ledger adds each new transaction to `ledger.csv`.", "", "1. Run `bun run import statement.csv`."];
  expect(page(shaped)).toEqual([]);
  expect(page(shaped.slice(3))).toEqual(["the page names no Diátaxis mode in kind front matter"]);
  expect(page(shaped.map((line) => line.replace("# Import a bank export", "# Importing Bank Exports")))).toEqual([
    "a heading names a thing rather than the task: # Importing Bank Exports",
    "a heading in title case: # Importing Bank Exports",
  ]);
  expect(page([...shaped, "", "This guide explains the import. Support for more banks is planned."])).toEqual([
    "a line holds 2 sentences: This guide explains the import. Support for more banks is planned.",
    "talks about the page rather than the subject: This guide explains the import.",
    "says what is not true now: Support for more banks is planned.",
  ]);
  expect(page(shaped.map((line) => line.replace("# Import a bank export", "# Импорт выгрузки")))).toEqual(["a heading names a thing rather than the task: # Импорт выгрузки"]);
  expect(page(shaped.map((line) => line.replace("# Import a bank export", "# Импортируйте выгрузку")))).toEqual([]);
  expect(page(shaped.map((line) => line.replace("# Import a bank export", "# Особенности импорта")))).toEqual(["a heading names a thing rather than the task: # Особенности импорта"]);
});

test("technical-writing reads no line inside a code fence as a heading", () => {
  const readme = docShape([/bun install/, /bun test/], false);
  const commented = (heading: string, comment: string) => [heading, "", "```sh", comment, "bun install", "bun test", "```"];
  expect(readme(commented("## Installation", "# install dependencies"))).toEqual(["a heading names a thing rather than the task: ## Installation"]);
  expect(readme(commented("## Install Ledger", "# Installing deps"))).toEqual([]);
});

test("technical-writing reads a numbered heading by the word after its number", () => {
  const readme = docShape([/bun install/, /bun test/], false);
  const numbered = (install: string, verify: string) => [install, "", "Run `bun install`.", "", verify, "", "Run `bun test`."];
  expect(readme(numbered("## 1. Установка", "## 2. Проверка"))).toEqual([
    "a heading names a thing rather than the task: ## 1. Установка",
    "a heading names a thing rather than the task: ## 2. Проверка",
  ]);
  expect(readme(numbered("## 1. Installation", "## 2. Testing"))).toEqual([
    "a heading names a thing rather than the task: ## 1. Installation",
    "a heading names a thing rather than the task: ## 2. Testing",
  ]);
  expect(readme(numbered("## 1. Install Ledger", "## 2) Check the working copy"))).toEqual([]);
  expect(readme(numbered("## Шаг 1. Установите зависимости", "## Шаг 2. Запустите тесты"))).toEqual([]);
  expect(readme(numbered("## Step 1: Installation", "## Step 2: Testing"))).toEqual([
    "a heading names a thing rather than the task: ## Step 1: Installation",
    "a heading names a thing rather than the task: ## Step 2: Testing",
  ]);
  const page = docShape([/bun run import/], true);
  expect(page(["---", "kind: how-to", "---", "```sh", "# Importing", "```", "# Import a bank export", "", "1. Run `bun run import statement.csv`."])).toEqual([]);
});

test("unslop fails a PR description in the first person and passes the guided ones", async () => {
  const guided = await output("ru-pr.guided.txt");
  expect(judged(caseOf("unslop/ru-pr").judge, "PR.md", "", `${guided}\nI haven't run the suite (Code) for this description.\n`)).toBe("fail");
  expect((await verdictFor("unslop/ru-pr", "PR.md", "ru-pr.guided.txt")).outcome).toBe("pass");
  const slop = "Ledger is not just a tool, but a seamless way to keep books. I hope this helps!";
  expect(unslop([slop])).toEqual([`puffery or promotion: ${slop}`, `a framing set up to state the point: ${slop}`, `chatbot framing: ${slop}`]);
});

test("unslop fails the puffed-up copy edit on its planted tells and passes the cleared rewrite", () => {
  const puff = CASES.find((c) => c.id === "copy-edit-puff") ?? expect.unreachable("no copy-edit-puff case");
  const found = verdict(puff.judge, "docs/overview.md", "", puff.files["docs/overview.md"] ?? "");
  expect(found.outcome).toBe("fail");
  expect("evidence" in found ? found.evidence.map((line) => line.slice(0, line.indexOf(":"))) : []).toEqual([
    "a heading in title case",
    "a fancy way to say \"is\"",
    "a passive sentence whose actor could lead it",
    "an inline-header label",
    "a dash, a parenthesis or a semicolon",
    "puffery or promotion",
    "a generic conclusion",
    "an unsourced claim",
  ]);
  const plain = "# Import ledger entries\n\nRun `bun run import` to load ledger.csv, the export from your bank.\nThe importer checks each row and skips duplicates.\nIt lists the duplicate rows at the end of the run.\n";
  expect(judged(puff.judge, "docs/overview.md", "", plain)).toBe("pass");
});

test("unslop flags first person on the board's quoted line and passes the guided PR descriptions", async () => {
  const quoted = "I haven't run the suite (Code) for this description.";
  expect(firstPerson([quoted])).toEqual([`first person: ${quoted}`]);
  expect(firstPerson(["Банк меняет пробелы или регистр."])).toEqual([]);
  const declined = "В нашем импортере имя получателя теперь нормализуется перед проверкой дублей.";
  expect(firstPerson([declined])).toEqual([`first person: ${declined}`]);
  expect(["нашего", "нашим", "моего", "моим"].map((word) => firstPerson([`Исправление ${word} импортера.`]).length)).toEqual([1, 1, 1, 1]);
  expect(firstPerson(["Импорт помогает бухгалтеру."])).toEqual([]);
  expect(firstPerson((await output("en-pr.guided.txt")).split("\n"))).toEqual([]);
  expect(firstPerson((await output("ru-pr.guided.txt")).split("\n"))).toEqual([]);
});

test("unslop flags a site paragraph that opens anywhere but on the mechanism", async () => {
  const unguidedEn = opensOnMechanism((await output("en-site.unguided.txt")).split("\n"));
  expect(unguidedEn).toHaveLength(1);
  expect(unguidedEn[0]).toStartWith("does not open on the mechanism: Ledger helps you keep track");
  const unguidedRu = opensOnMechanism((await output("ru-site.unguided.txt")).split("\n"));
  expect(unguidedRu).toHaveLength(1);
  expect(unguidedRu[0]).toStartWith("does not open on the mechanism: Ledger помогает");
  expect(opensOnMechanism((await output("en-site.guided.txt")).split("\n"))).toEqual([]);
  expect(opensOnMechanism((await output("ru-site.guided.txt")).split("\n"))).toEqual([]);
  expect(opensOnMechanism(["Ledger takes the CSV file."])).toEqual([]);
  expect(opensOnMechanism(["Ledger builds your books from the CSV statement your bank already lets you download."])).toEqual([]);
  expect(opensOnMechanism(["Ledger works for freelancers. It reads the bank's CSV file."])).toEqual(["does not open on the mechanism: Ledger works for freelancers."]);
  const benefit = "Ledger saves freelancers time by reading the bank's CSV export and adding each transaction to a local ledger file.";
  expect(opensOnMechanism([benefit])).toEqual([`does not open on the mechanism: ${benefit}`]);
  expect(opensOnMechanism(["Ledger reads the export your bank lets you download as a CSV file and adds each transaction to a local ledger file."])).toEqual([]);
  expect(opensOnMechanism(["Ledger reads `statement.csv`, the export from your bank."])).toEqual([]);
  expect(opensOnMechanism(["Ledger reads the .csv file your bank exports."])).toEqual([]);
  const { judge } = caseOf("unslop/en-site-index");
  expect(judged(judge, "site/index.md", "", "Ledger helps freelancers keep track of CSV bank transactions. It reads the export and adds each transaction to a local ledger file.")).toBe("fail");
  expect(judged(judge, "site/index.md", "", "Ledger helps freelancers keep `books`. It reads the bank's CSV file.")).toBe("fail");
  expect(judged(judge, "site/index.md", "", "Ledger reads the bank's export, a CSV file, and adds each transaction to a local ledger file.")).toBe("pass");
  expect(judged(judge, "site/index.md", "", "Ledger reads `statement.csv`, the export from your bank, and adds each transaction to a local ledger file.")).toBe("pass");
});

test("a message file is judged message by message, and one missing a code or not JSON is unjudged", () => {
  const { judge } = caseOf("plain-words/en-errors");
  const judgedOn = (after: string) => verdictOf(judge, run([], [{ path: "src/messages.json", before: undefined, after }]));
  expect(judgedOn('{"NOT_CSV": "Pick a CSV file."}')).toEqual({ outcome: "unjudged", why: "src/messages.json has no message for FILE_TOO_LARGE, MISSING_COLUMNS, ALREADY_IMPORTED" });
  expect(judgedOn("not json")).toEqual({ outcome: "unjudged", why: "src/messages.json is not a JSON object" });
  const messages = {
    FILE_TOO_LARGE: "The file is over 10 MB. Pick a smaller file.",
    NOT_CSV: { title: "Not a CSV file", body: "Simply pick a CSV file." },
    MISSING_COLUMNS: "Add the missing columns {columns}.",
    ALREADY_IMPORTED: "Ledger imported every row on {date} already. Nothing was added.",
  };
  expect(judgedOn(JSON.stringify(messages))).toMatchObject({ outcome: "fail", evidence: ["an adverb propping up a verb: Simply pick a CSV file."] });
});

test("technical-writing fails the unguided docs pages on a missing mode, a nominal title, two sentences to a line and wrapped sentences, and passes the guided ones", async () => {
  expect(tellsOf(await verdictFor("technical-writing/en-docs", "docs/import.md", "en-docs.unguided.txt"))).toEqual([
    "the page names no Diátaxis mode in kind front matter",
    "a heading names a thing rather than the task",
    "a line holds 2 sentences",
    "a line holds 3 sentences",
  ]);
  expect(tellsOf(await verdictFor("technical-writing/ru-docs", "docs/import.md", "ru-docs.unguided.txt"))).toContain("a sentence wraps onto the next line");
  expect((await verdictFor("technical-writing/en-docs", "docs/import.md", "en-docs.guided.txt")).outcome).toBe("pass");
  expect((await verdictFor("technical-writing/ru-docs", "docs/import.md", "ru-docs.guided.txt")).outcome).toBe("pass");
});

test("a bold lead-in ends its sentence, and a modal such as нужно does not make a step of the infinitive after it", () => {
  const long = Array.from({ length: 20 }, () => "word").join(" ");
  expect(plainSentences([`**Rows may now merge.** ${long}.`])).toEqual([]);
  expect(russianProse(["- Нужно решить, допустимо ли это."])).toEqual([]);
});

test("writing-for-agents fails an unguided line that names the default exports it bans and passes the guided one that states only named exports", async () => {
  expect(await verdictFor("writing-for-agents/positive-target", "AGENTS.md", "positive-target.unguided.txt")).toMatchObject({ outcome: "fail" });
  expect(await verdictFor("writing-for-agents/positive-target", "AGENTS.md", "positive-target.guided.txt")).toMatchObject({ outcome: "pass" });
  expect(verdictOf(positiveTarget, run([], [{ path: "AGENTS.md", before: "# Agent notes\n", after: "# Agent notes\nKeep files small.\n" }])).outcome).toBe("unjudged");
});

test("writing-for-agents fails an unguided AGENTS.md that restates the package scripts and passes the guided one that keeps only the gotcha", async () => {
  expect(await verdictFor("writing-for-agents/lookup-left", "AGENTS.md", "lookup-left.unguided.txt")).toMatchObject({
    outcome: "fail",
    evidence: [
      "AGENTS.md restates the lint script, oxlint, which package.json holds",
      "AGENTS.md restates the typecheck script, tsc --noEmit, which package.json holds",
      "AGENTS.md restates the build script, bun build src/index.ts --outdir dist, which package.json holds",
    ],
  });
  expect((await verdictFor("writing-for-agents/lookup-left", "AGENTS.md", "lookup-left.guided.txt")).outcome).toBe("pass");
  const scripts = { test: "bun test", lint: "oxlint" };
  const lookedUp = (after: string) => verdictOf(lookupLeft(scripts, /TZ=UTC/), run([], [{ path: "AGENTS.md", before: "# Agent notes\n", after }])).outcome;
  expect(lookedUp("# Agent notes\nRun `bun run lint`.\n")).toBe("unjudged");
  expect(lookedUp("# Agent notes\nTests need TZ=UTC.\nRun `bun run lint`.\n")).toBe("pass");
  expect(lookedUp("# Agent notes\nTests need TZ=UTC.\nRun `bun run lint` and `bun test`.\n")).toBe("fail");
  const { judge } = caseOf("writing-for-agents/lookup-left");
  const judgedOn = (after: string) => verdictOf(judge, run([], [{ path: "AGENTS.md", before: "# Agent notes\n", after }])).outcome;
  expect(judgedOn("# Agent notes\n- Tests need `TZ=UTC`: run `TZ=UTC bun test`, `bun run lint`, `bun run typecheck` and `bun run build`.\n")).toBe("fail");
  expect(judgedOn("# Agent notes\n- Tests need `TZ=UTC`: run `TZ=UTC bun test`.\n")).toBe("pass");
});

test("writing-for-agents fails an unguided checklist that restates the test command and passes the guided one that points at the section holding it", async () => {
  expect(await verdictFor("writing-for-agents/one-source", "AGENTS.md", "one-source.unguided.txt")).toMatchObject({ outcome: "fail" });
  expect(await verdictFor("writing-for-agents/one-source", "AGENTS.md", "one-source.guided.txt")).toMatchObject({ outcome: "pass" });
  const seeded = caseOf("writing-for-agents/one-source").files["AGENTS.md"] ?? "";
  expect(verdictOf(oneSource, run([], [{ path: "AGENTS.md", before: seeded, after: `${seeded}\n## Before you open a pull request\n\n- The tests pass.\n` }])).outcome).toBe("unjudged");
  const restated = `${seeded}\n## Before you open a pull request\n\n- The tests pass: \`bun run test\` exits cleanly.\n- The lint is clean.\n- CHANGELOG.md has an entry.\n`;
  expect(verdictOf(oneSource, run([], [{ path: "AGENTS.md", before: seeded, after: restated }])).outcome).toBe("fail");
});

const ruled = (id: string, path: string, after: string): Verdict => {
  const c = caseOf(`writing-for-people/${id}`);
  return verdictOf(c.judge, run([], [{ path, before: c.files[path], after }]));
};

test("writing-for-people fails the unguided README, PR, site and messages outputs on what its core forbids, and passes the guided ones", async () => {
  expect(tellsOf(await verdictFor("writing-for-people/en-readme", "README.md", "en-readme.unguided.txt"))).toEqual(["a heading names a thing rather than the task", "a dash, a parenthesis or a semicolon"]);
  expect(tellsOf(await verdictFor("writing-for-people/ru-readme", "README.md", "ru-readme.unguided.txt"))).toEqual(["a heading names a thing rather than the task", "a line holds 2 sentences"]);
  expect(tellsOf(await verdictFor("writing-for-people/ru-pr", "PR.md", "ru-pr.unguided.txt"))).toEqual(["an inline-header label", "a dash, a parenthesis or a semicolon"]);
  expect(tellsOf(await verdictFor("writing-for-people/ru-site", "site/about.md", "ru-site.unguided.txt"))).toContain("puffery or promotion");
  expect(tellsOf(await verdictFor("writing-for-people/ru-errors", "src/messages.json", "ru-errors.unguided.json"))).toEqual(["a dash, a parenthesis or a semicolon"]);
  expect((await verdictFor("writing-for-people/en-pr", "PR.md", "en-pr.unguided.txt")).outcome).toBe("fail");
  for (const [id, path, ext] of [
    ["en-readme", "README.md", "txt"],
    ["ru-readme", "README.md", "txt"],
    ["en-pr", "PR.md", "txt"],
    ["ru-pr", "PR.md", "txt"],
    ["en-site", "site/about.md", "txt"],
    ["ru-site", "site/about.md", "txt"],
    ["ru-errors", "src/messages.json", "json"],
  ] as const) {
    expect((await verdictFor(`writing-for-people/${id}`, path, `${id}.guided.${ext}`)).outcome, id).toBe("pass");
  }
});

test("writing-for-people fails a README section titled by a noun or prose carried over with its parenthesis and semicolon, and passes task headings in plain prose", () => {
  const before = "# Ledger\n\nLedger imports transactions from CSV files.\n";
  const fence = "```";
  const usual = `${before}\n## Installation\n\nInstall dependencies (Bun 1.2 or later):\n\n${fence}sh\nbun install\n${fence}\n\n## Verification\n\nRun the test suite; every test should pass:\n\n${fence}sh\nbun test\n${fence}\n`;
  expect(ruled("en-readme", "README.md", usual).outcome).toBe("fail");
  expect(ruled("en-readme", "README.md", usual.replace("## Installation", "## Install Ledger").replace("## Verification", "## Verify the checkout")).outcome).toBe("fail");
  expect(ruled("en-readme", "README.md", usual.replace(" (Bun 1.2 or later):", ", which need Bun 1.2 or later:").replace("; every", ". Every")).outcome).toBe("fail");
  const taught = `${before}\n## Install Ledger\n\nLedger needs Bun 1.2 or later.\nRun \`bun install\`.\n\n## Verify the checkout\n\nRun \`bun test\`.\nEvery test passes on a good checkout.\n`;
  expect(ruled("en-readme", "README.md", taught).outcome).toBe("pass");
  expect(ruled("en-readme", "README.md", `${taught}\n## Troubleshooting\n\nIf \`bun install\` fails, upgrade Bun.\n`).outcome).toBe("pass");
  expect(ruled("en-readme", "README.md", `${before}\nRun \`bun install\`, then \`bun test\`.\n`).outcome).toBe("unjudged");
  expect(ruled("en-readme", "README.md", taught.replace("Ledger needs Bun 1.2 or later.\n", "")).outcome).toBe("unjudged");
  expect(ruled("en-readme", "README.md", taught.replace("Ledger imports transactions from CSV files.\n", ""))).toMatchObject({ outcome: "unjudged", why: "README.md dropped what it held before" });
  expect(ruled("en-readme", "README.md", taught.replace("\n## Verify the checkout\n", ""))).toMatchObject({ outcome: "unjudged", why: "the new commands do not sit under a heading each" });
});

test("writing-for-people fails a PR description or site copy that keeps a tell, the unslop catalogue's chatbot framing and puffery among them", async () => {
  const usual = "## Fix Duplicate Detection\n\nThe new key serves as the dedup signal (date, amount, payee); rows seen before are skipped by the importer.\n**Key:** the payee is trimmed and lowercased.\nThe amount keeps two decimal places.\n";
  expect(tellsOf(ruled("en-pr", "PR.md", usual))).toEqual([
    "a heading in title case",
    "a fancy way to say \"is\"",
    "a passive sentence whose actor could lead it",
    "an inline-header label",
    "a dash, a parenthesis or a semicolon",
  ]);
  const plain = "Dedup now keys on the date, the amount and the payee.\nThe importer rounds the amount to two decimal places.\nIt trims the payee and lowercases it before comparing.\nA row seen before is skipped.\n";
  expect(ruled("en-pr", "PR.md", plain).outcome).toBe("pass");
  expect(tellsOf(ruled("en-pr", "PR.md", `${plain}I hope this helps!\n`))).toEqual(["chatbot framing"]);
  const site = await output("en-site.guided.txt");
  expect(ruled("en-site", "site/about.md", site).outcome).toBe("pass");
  expect(tellsOf(ruled("en-site", "site/about.md", `Ledger is a seamless way to keep your books.\n${site}`))).toEqual(["puffery or promotion"]);
});

test("writing-for-people leaves unjudged a text that drops the facts its task gave", async () => {
  expect(ruled("en-pr", "PR.md", "The change is small.\n")).toMatchObject({ outcome: "unjudged", why: "PR.md does not carry the facts the task gave" });
  expect(ruled("en-pr", "PR.md", "Dedup now keys on the date, the amount and the payee.\n").outcome).toBe("unjudged");
  expect(ruled("en-site", "site/about.md", "Ledger reads the CSV file your bank exports.\n").outcome).toBe("unjudged");
  const pr = "Dedup now keys on the date, the amount and the payee.\nThe importer rounds the amount to two decimal places.\nIt trims the payee and lowercases it before comparing.\nA row seen before is skipped.\n";
  expect(ruled("en-pr", "PR.md", pr).outcome).toBe("pass");
  for (const dropped of [
    pr.replace("It trims the payee and lowercases it", "It lowercases the payee"),
    pr.replace("It trims the payee and lowercases it", "It trims the payee"),
    pr.replace("two decimal places", "one decimal place"),
    pr.replace("A row seen before is skipped.\n", ""),
  ]) {
    expect(ruled("en-pr", "PR.md", dropped).outcome, dropped).toBe("unjudged");
  }
  const ruPr = "Ключ содержит дату, сумму и получателя.\nСумма округляется до двух знаков после запятой.\nПробелы по краям получателя удаляются, буквы приводятся к нижнему регистру.\nПовторные строки пропускаются.\n";
  expect(ruled("ru-pr", "PR.md", ruPr).outcome).toBe("pass");
  expect(ruled("ru-pr", "PR.md", ruPr.replace("до двух знаков после запятой", "с двумя знаками после запятой")).outcome).toBe("pass");
  expect(ruled("ru-pr", "PR.md", ruPr.replace("Повторные строки пропускаются.", "Повтор не попадает в результат.")).outcome).toBe("pass");
  expect(ruled("en-pr", "PR.md", pr.replace("A row seen before is skipped.", "The function drops a row already in seen.")).outcome).toBe("pass");
  const site = await output("en-site.guided.txt");
  for (const dropped of [
    site.replace("Ledger is free and open source under the MIT licence.\n", ""),
    site.replace("free and open source under the MIT licence", "under the MIT licence"),
    site.replace("Ledger adds each transaction to a ledger file on your computer.\n", ""),
    site.replace("no account", "an account"),
    site.replace("no upload", "an upload"),
    site.replace("no subscription", "a subscription"),
    site.replace("Your data stays on your computer", "Your data goes to our server"),
    site.replace("Ledger skips transactions it has already added", "Ledger adds them"),
  ]) {
    expect(ruled("en-site", "site/about.md", dropped).outcome, dropped).toBe("unjudged");
  }
  const ruSite = await output("ru-site.guided.txt");
  expect(ruled("ru-site", "site/about.md", ruSite).outcome).toBe("pass");
  for (const paraphrase of [
    "You need no account, upload, or subscription.",
    "You need no account, you upload nothing, and you pay no subscription.",
  ]) {
    expect(ruled("en-site", "site/about.md", site.replace("Your data stays on your computer, with no account, no upload, and no subscription.", paraphrase)).outcome, paraphrase).toBe("pass");
  }
  expect(ruled("en-site", "site/about.md", site.replace("Your data stays on your computer, with no account, no upload, and no subscription.", "You need no account, an upload, or a subscription.")).outcome).toBe("unjudged");
  for (const paraphrase of [
    ruSite.replace("Регистрироваться не нужно.\nДанные остаются только на вашем компьютере.\nПодписки нет, Ledger бесплатный, его код открыт", "Ledger работает без аккаунта, отправки данных на сервер и подписки.\nПлатить за него не нужно, его код открыт"),
    ruSite.replace("Данные остаются только на вашем компьютере.", "Данные никуда не отправляются."),
  ]) {
    expect(ruled("ru-site", "site/about.md", paraphrase).outcome, paraphrase).toBe("pass");
  }
  for (const dropped of [ruSite.replace("Регистрироваться не нужно.", "Нужно зарегистрироваться."), ruSite.replace("Подписки нет, ", "Нужна подписка, "), ruSite.replace("Данные остаются только на вашем компьютере.", "Данные уходят на наш сервер.")]) {
    expect(ruled("ru-site", "site/about.md", dropped).outcome, dropped).toBe("unjudged");
  }
  const codes = ["FILE_TOO_LARGE", "NOT_CSV", "MISSING_COLUMNS", "ALREADY_IMPORTED"];
  const each = (message: unknown) => JSON.stringify(Object.fromEntries(codes.map((code) => [code, message])));
  expect(ruled("en-errors", "src/messages.json", each(null))).toEqual({ outcome: "unjudged", why: `src/messages.json has no message for ${codes.join(", ")}` });
  expect(ruled("en-errors", "src/messages.json", each("Error."))).toEqual({ outcome: "unjudged", why: `src/messages.json drops the fact the task gave for ${codes.join(", ")}` });
  const bare = { FILE_TOO_LARGE: "10 MB.", NOT_CSV: "CSV.", MISSING_COLUMNS: "{columns}", ALREADY_IMPORTED: "{date}" };
  expect(ruled("en-errors", "src/messages.json", JSON.stringify(bare))).toEqual({ outcome: "unjudged", why: `src/messages.json drops the fact the task gave for ${codes.join(", ")}` });
  const plain = {
    FILE_TOO_LARGE: "The file holds more than 10 MB. Split it by month and import each part.",
    NOT_CSV: "This file is not a CSV file. Pick a CSV file and press Import again.",
    MISSING_COLUMNS: "Add the missing columns {columns} to the file and press Import again.",
    ALREADY_IMPORTED: "Ledger imported every row before on {date}. Nothing was added.",
  };
  for (const [code, message] of Object.entries({
    FILE_TOO_LARGE: "Pick a file within the 10 MB limit.",
    NOT_CSV: "Could not read CSV.",
    MISSING_COLUMNS: "Missing values for {columns}.",
    ALREADY_IMPORTED: "Some rows were already imported on {date}. Nothing was added.",
  })) {
    expect(ruled("en-errors", "src/messages.json", JSON.stringify({ ...plain, [code]: message }))).toEqual({ outcome: "unjudged", why: `src/messages.json drops the fact the task gave for ${code}` });
  }
  expect(ruled("en-errors", "src/messages.json", JSON.stringify(plain)).outcome).toBe("pass");
  expect(tellsOf(ruled("en-errors", "src/messages.json", JSON.stringify({ ...plain, FILE_TOO_LARGE: "The file is too large (over 10 MB); split it by month." })))).toEqual(["a dash, a parenthesis or a semicolon"]);
  expect(ruled("ru-errors", "src/messages.json", JSON.stringify({ ...plain, FILE_TOO_LARGE: "Файл больше 10 МБ. Разбейте его по месяцам." })).outcome).toBe("pass");
  expect(ruled("ru-errors", "src/messages.json", JSON.stringify({ ...plain, MISSING_COLUMNS: "В файле нет колонок {columns}." })).outcome).toBe("pass");
  for (const [code, message] of [
    ["NOT_CSV", "Файл не является файлом CSV. Выберите файл CSV."],
    ["NOT_CSV", "Файл имеет формат отличный от CSV."],
    ["MISSING_COLUMNS", "Файл не содержит колонок {columns}."],
    ["MISSING_COLUMNS", "The file is missing {columns}."],
    ["ALREADY_IMPORTED", "Вы уже импортировали все строки файла {date}. Импорт не добавил новые строки."],
    ["ALREADY_IMPORTED", "You imported every row in this file on {date}. The import added no rows."],
    ["ALREADY_IMPORTED", "Файл уже импортирован {date}. Новые строки не добавлены."],
  ] as const) {
    expect(ruled("ru-errors", "src/messages.json", JSON.stringify({ ...plain, [code]: message })).outcome, message).toBe("pass");
  }
  expect(ruled("ru-errors", "src/messages.json", JSON.stringify({ ...plain, NOT_CSV: "Не удалось прочитать CSV." })).outcome).toBe("unjudged");
});
