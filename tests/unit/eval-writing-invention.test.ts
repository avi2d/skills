import { expect, test } from "bun:test";
import { LEDGER } from "../../evals/cases/writing/ledger";
import { noInvention } from "../../evals/writing-invention";

test("technical-writing flags a command, a path or a package the notes and repository do not hold", () => {
  const check = noInvention(LEDGER.enReadme.files, "README.md");
  const invented = [
    "Clone the repository with `git clone https://github.com/example/ledger.git`, then run `bun install`.",
    "The install drops every dependency into `node_modules/`.",
    "The command ends with a done line.",
  ];
  expect(check(invented).map((line) => line.split(":")[0])).toEqual([
    "an invented command the notes and repository do not hold",
    "an invented path the notes and repository do not hold",
    "an invented path the notes and repository do not hold",
    "states what the command shows, which the notes and repository do not hold",
  ]);
  expect(check(["Run `bun install`.", "Then run `bun test`.", "Every test passes on a clean checkout."])).toEqual([]);
  const docs = noInvention(LEDGER.enDocs.files, "docs/import.md");
  expect(docs(["Run `bun run import ~/Downloads/statement-2026-08.csv`."])).toEqual([]);
  expect(docs(["Run `bun add ledger-formats` for the extra columns."])).toEqual(["an invented command the notes and repository do not hold: bun add ledger-formats"]);
});

test("technical-writing holds a path the case repository seeds and one the notes name exactly, and flags any other", () => {
  const readme = noInvention(LEDGER.enReadme.files, "README.md");
  expect(readme(["The installation notes are in `notes.txt`.", "The test script lives in `package.json`."])).toEqual([]);
  const docs = noInvention(LEDGER.enDocs.files, "docs/import.md");
  expect(docs(["Add a column mapping to `ledger.config.json`.", "Ledger writes to `ledger.csv`."])).toEqual([]);
  expect(docs(["See [the mapping](docs/mapping.md).", "Add a column mapping to `config.json`."])).toEqual([
    "an invented path the notes and repository do not hold: docs/mapping.md",
    "an invented path the notes and repository do not hold: config.json",
  ]);
  expect(docs(["Save the export as ~/Downloads/statement-2026-08.csv first."])).toEqual([
    "an invented path the notes and repository do not hold: ~/Downloads/statement-2026-08.csv",
  ]);
});

test("technical-writing reads a command with all of its arguments, and holds it only where the notes or repository hold the whole of it", () => {
  const readme = noInvention(LEDGER.enReadme.files, "README.md");
  expect(readme(["Run `bun install ledger`.", "Run bun install ledger.", "Run `bun test --watch`."])).toEqual([
    "an invented command the notes and repository do not hold: bun install ledger",
    "an invented command the notes and repository do not hold: bun install ledger",
    "an invented command the notes and repository do not hold: bun test --watch",
  ]);
  expect(readme(["Install dependencies with bun install, then run `bun test`."])).toEqual([]);
  expect(readme(['Run bun install "ledger".', "Run bun install 'ledger'."])).toEqual([
    'an invented command the notes and repository do not hold: bun install "ledger"',
    "an invented command the notes and repository do not hold: bun install 'ledger'",
  ]);
  expect(readme(["Run bun test to verify the checkout.", "Run bun install and bun test before you commit."])).toEqual([]);
  const ruReadme = noInvention(LEDGER.ruReadme.files, "README.md");
  expect(ruReadme(["Выполните bun test для проверки рабочей копии."])).toEqual([]);
});

test("technical-writing compares a path and a command with the notes and repository exactly, letter case included", () => {
  expect(noInvention(LEDGER.enReadme.files, "README.md")(["See Notes.txt."])).toEqual(["an invented path the notes and repository do not hold: Notes.txt"]);
  expect(noInvention(LEDGER.enDocs.files, "docs/import.md")(["Run `bun run Import statement.csv`."])).toEqual([
    "an invented command the notes and repository do not hold: bun run Import statement.csv",
    "an invented path the notes and repository do not hold: statement.csv",
  ]);
});

test("technical-writing flags what a command shows, in a code span or in Russian, when the notes do not hold it", () => {
  const readme = noInvention(LEDGER.enReadme.files, "README.md");
  expect(readme(["The command prints `done`.", "`bun install` prints `done`.", "The command prints `ledger`."])).toEqual([
    "states what the command shows, which the notes and repository do not hold: The command prints `done`.",
    "states what the command shows, which the notes and repository do not hold: `bun install` prints `done`.",
    "states what the command shows, which the notes and repository do not hold: The command prints `ledger`.",
  ]);
  const ruReadme = noInvention(LEDGER.ruReadme.files, "README.md");
  expect(ruReadme(["Команда выводит строку done."])).toEqual(["states what the command shows, which the notes and repository do not hold: Команда выводит строку done."]);
  const ruDocs = noInvention(LEDGER.ruDocs.files, "docs/import.md");
  expect(ruDocs(["Если Ledger пишет, что не хватает колонок, настройте колонки в `ledger.config.json`."])).toEqual([]);
});
