import { addedTo, docShape, judgedBy, messagesIn, sectionEach, type Check, type Reader } from "../../writing-judges";
import { withPackage, type EvalCase } from "../fixture";

const DIFF = `diff --git a/src/import.ts b/src/import.ts
--- a/src/import.ts
+++ b/src/import.ts
@@ -12,9 +12,11 @@ export function importRows(rows: Row[], seen: Set<string>): Row[] {
   const kept: Row[] = [];
   for (const row of rows) {
-    const key = row.raw;
+    const key = [row.date, row.amount.toFixed(2), row.payee.trim().toLowerCase()].join("|");
     if (seen.has(key)) continue;
     seen.add(key);
     kept.push(row);
   }
   return kept;
 }
diff --git a/test/import.test.ts b/test/import.test.ts
--- a/test/import.test.ts
+++ b/test/import.test.ts
@@ -30,3 +30,12 @@ test("skips a row seen before", () => {
+
+test("skips a row that differs only in spacing or case of the payee", () => {
+  const seen = new Set<string>();
+  const first = importRows([row("2026-09-01", 12.5, "Coffee Shop")], seen);
+  const again = importRows([row("2026-09-01", 12.50, " coffee shop ")], seen);
+  expect(first).toHaveLength(1);
+  expect(again).toHaveLength(0);
+});
`;

const FACTS_EN = `Ledger reads the CSV file a bank exports and adds each transaction to a local ledger file.
It skips a transaction it has already imported, so the same export can be imported twice.
It runs on the user's own computer. No account, no upload, no subscription.
It is free and open source under the MIT licence.
It works with exports from Sberbank, Tinkoff and Revolut; other banks need a column mapping.
`;

const FACTS_RU = `Ledger читает CSV-файл, который выгружает банк, и добавляет каждую операцию в локальный файл учёта.
Операцию, которую он уже импортировал, он пропускает, поэтому одну выгрузку можно импортировать дважды.
Работает на компьютере пользователя. Без аккаунта, без загрузки на сервер, без подписки.
Бесплатный, открытый код под лицензией MIT.
Понимает выгрузки Сбербанка, Тинькофф и Revolut; для других банков нужна настройка колонок.
`;

const ERRORS_EN = `Errors the import screen shows. The user picked a file and pressed Import.

- FILE_TOO_LARGE: the file is over 10 MB, the limit.
- NOT_CSV: the file is not a CSV file.
- MISSING_COLUMNS: the file lacks one of the columns date, amount, payee. The missing column names are in {columns}.
- ALREADY_IMPORTED: every row in the file was imported before, on {date}. Nothing was added.
`;

const ERRORS_RU = `Ошибки, которые показывает экран импорта. Пользователь выбрал файл и нажал «Импортировать».

- FILE_TOO_LARGE: файл больше 10 МБ, это предел.
- NOT_CSV: файл не в формате CSV.
- MISSING_COLUMNS: в файле нет одной из колонок date, amount, payee. Названия недостающих колонок приходят в {columns}.
- ALREADY_IMPORTED: все строки файла уже импортированы раньше, {date}. Ничего не добавлено.
`;

const IMPORT_EN = `Importing a bank export into Ledger, notes from the support inbox.

Download the CSV export from your bank's website first.
Run bun run import <file>, for example bun run import ~/Downloads/statement.csv.
Ledger adds each new transaction to ledger.csv and skips the ones it has imported before.
A file over 10 MB is refused; split it by month and import each part.
If Ledger says columns are missing, the bank's export needs a column mapping in ledger.config.json.
`;

const IMPORT_RU = `Импорт выгрузки банка в Ledger, заметки из почты поддержки.

Сначала скачать CSV-выгрузку на сайте банка.
Запуск: bun run import <файл>, например bun run import ~/Downloads/statement.csv.
Ledger добавляет каждую новую операцию в ledger.csv и пропускает те, что уже импортировал.
Файл больше 10 МБ не принимается; его надо разбить по месяцам и импортировать по частям.
Если Ledger пишет, что не хватает колонок, для выгрузки банка нужна настройка колонок в ledger.config.json.
`;

const MESSAGES = messagesIn("src/messages.json", {
  FILE_TOO_LARGE: [/10\s*(?:MB|МБ|megabyte|мегабайт)/iu, /\bover\b|more than|larger|bigger|too (?:large|big)|exceed|above|больше|превыш|слишком/iu],
  NOT_CSV: [
    /(?:\bnot\b|n['’]t\b)(?:(?!read|parse|open|load)[^.]){0,20}CSV|\bonly CSV|CSV files? only|\b(?:must|needs? to) be (?:an? )?CSV|(?<!\p{L})не(?!\p{L})(?:(?!удал|прочит|открыт|загруз)[^.]){0,25}CSV|отличн\p{L}* от CSV|(?<!\p{L})только(?!\p{L})[^.]{0,15}CSV/iu,
  ],
  MISSING_COLUMNS: [
    /\{columns\}/,
    /(?:missing|lacks|(?<!\p{L})(?:нет|не хватает|не содержит)(?!\p{L})|отсутств|недоста)(?:(?!values?|data|значени|данн)[^.]){0,30}(?:column|колон|столб|\{columns\})|(?:column|колон|столб|\{columns\})[^.]{0,30}(?:missing|отсутств|не хватает)/iu,
  ],
  ALREADY_IMPORTED: [
    /\{date\}/,
    /\b(?:every|all|each|whole|entire|this file|same file|these rows)\b|\bfile (?:was |has been )?(?:already )?imported|(?<!\p{L})(?:все|всё|весь|каждую|каждая|этот файл|эти строки)(?!\p{L})|файл\p{L}* уже импорт/iu,
    /already|before|earlier|imported[^.]{0,40}\{date\}|(?<!\p{L})(?:уже|раньше|ранее)(?!\p{L})|импортир\p{L}*[^.]{0,40}\{date\}/iu,
    /nothing|\bno (?:new )?(?:rows|transactions|entries)\b|\badded no\b|(?<!\p{L})ничего(?!\p{L})|(?<!\p{L})не (?:были )?добав/iu,
  ],
});

const README = sectionEach(addedTo("README.md", [/bun install/, /bun test/, /1\.2/, /pass|succeed|green|прох|прош|пройд|пройт|успеш/iu]), [/bun install/, /bun test/]);
export const KEY_FACTS = [
  /date|дат/iu,
  /amount|сумм/iu,
  /payee|получател|плательщик|контрагент/iu,
  /toFixed\(2\)|(?:two|2) (?:decimal|places|digits)|cents|(?<!\p{L})дв(?:а|ух|ум|умя) (?:знак|десятичн)|копе/iu,
  /trim|spac|whitespace|пробел/iu,
  /lower|case[- ]insensitive|регистр/iu,
];
const PR = addedTo("PR.md", [...KEY_FACTS, /skip|ignor|drop|zero rows|пропус|игнор|повтор/iu]);
const NOT_BEFORE = String.raw`(?:\b(?:no|without|never|nothing|don['’]t|doesn['’]t)\b|(?<!\p{L})(?:не|без|нет|ни)(?!\p{L}))`;
const NOT_AFTER = String.raw`(?:\bnot\b|n['’]t\b|\bnothing\b|(?<!\p{L})(?:не|нет)(?!\p{L}))`;
const CLAUSE = String.raw`[^.,;!?\n]{0,40}`;
const LIST = String.raw`(?:(?!\b(?:an?|the|with|but)\b|(?<!\p{L})(?:с|со|но|а)(?!\p{L}))[^.;!?\n]){0,60}`;
const excluded = (thing: string, instead = ""): RegExp => {
  const negated = `(?<=${NOT_BEFORE}${LIST})(?:${thing})|(?:${thing})(?=${CLAUSE}${NOT_AFTER})`;
  const bare = `(?<!${NOT_BEFORE}${LIST})(?:${thing})(?!${CLAUSE}${NOT_AFTER})`;
  return new RegExp(`^(?![\\s\\S]*${bare})[\\s\\S]*(?:${negated}${instead === "" ? "" : `|${instead}`})`, "iu");
};
const STAYS_LOCAL = String.raw`(?:stays?|remains?|kept|остают\p{L}*|хран\p{L}*|не покида\p{L}*)[^.!?\n]{0,40}(?:computer|device|machine|компьютер|устройств)|никуда не \p{L}+|\bnowhere\b`;
const SITE = addedTo("site/about.md", [
  /CSV/,
  /ledger file|ledger\.csv|local file|файл\p{L}* уч[её]та/iu,
  /computer|local|компьютер|локальн/iu,
  /skip|пропус/iu,
  /twice|again|дважды|повторн|снова/iu,
  excluded("account|sign[- ]?up|regist|аккаунт|регистр|учётн"),
  excluded("upload|server|cloud|сервер|облак", STAYS_LOCAL),
  excluded("subscri|подписк"),
  /\bfree\b|no cost|costs nothing|бесплат|(?<!\p{L})не плат|плат\p{L}*[^.]{0,25}не нужно|ноль рубл|ничего не стоит/iu,
  /open[- ]source|source code|открыт|открыв\p{L}* (?:его |свой )?код|код\p{L}* под лицензи/iu,
  /MIT/,
  /Sberbank|Сбербанк/iu,
  /Tinkoff|Тинькофф/iu,
  /Revolut/i,
  /mapping|column|колон|столб/iu,
]);
const IMPORT_PAGE = addedTo("docs/import.md", [/bun run import/]);

export type LedgerTask = Pick<EvalCase, "id" | "prompt" | "files"> & { written: Reader };

export const LEDGER = {
  enReadme: {
    id: "en-readme",
    prompt: "Add a section on installing Ledger and a section on verifying the checkout to README.md, using notes.txt. Keep the existing overview.",
    files: withPackage({
      "README.md": "# Ledger\n\nLedger imports transactions from CSV files.\n",
      "notes.txt": "Install dependencies with bun install (Bun 1.2 or later). Verify the checkout with bun test; every test should pass.\n",
    }),
    written: README,
  },
  enPr: {
    id: "en-pr",
    prompt: "Write the pull request description for the change in change.diff and save it as PR.md.",
    files: withPackage({ "change.diff": DIFF }),
    written: PR,
  },
  enSite: {
    id: "en-site",
    prompt: "Write the paragraph for site/about.md that tells a small business owner what Ledger does for them, using facts.md. One paragraph, no heading.",
    files: withPackage({ "facts.md": FACTS_EN, "site/about.md": "" }),
    written: SITE,
  },
  enSiteIndex: {
    id: "en-site-index",
    prompt: "Write the paragraph for site/index.md that tells a freelancer what Ledger does for them, using facts.md. One paragraph, no heading.",
    files: withPackage({ "facts.md": FACTS_EN, "site/index.md": "" }),
    written: addedTo("site/index.md", [/CSV/i]),
  },
  enErrors: {
    id: "en-errors",
    prompt: "Write the user-facing error messages for the import screen into src/messages.json, an object from each error code in errors.md to its message. Keep the {placeholders}.",
    files: withPackage({ "errors.md": ERRORS_EN }),
    written: MESSAGES,
  },
  enDocs: {
    id: "en-docs",
    prompt: "Write docs/import.md, the page that shows a Ledger user how to import their bank's CSV export, using notes.txt.",
    files: withPackage({ "notes.txt": IMPORT_EN }),
    written: IMPORT_PAGE,
  },
  ruReadme: {
    id: "ru-readme",
    prompt: "Добавь в README.md раздел об установке Ledger и раздел о проверке рабочей копии, по заметкам из notes.txt. Существующий обзор сохрани. Пиши по-русски.",
    files: withPackage({
      "README.md": "# Ledger\n\nLedger импортирует операции из CSV-файлов.\n",
      "notes.txt": "Зависимости ставятся через bun install (нужен Bun 1.2 или новее). Рабочая копия проверяется через bun test; все тесты должны пройти.\n",
    }),
    written: README,
  },
  ruPr: {
    id: "ru-pr",
    prompt: "Напиши по-русски описание пул-реквеста для изменения из change.diff и сохрани его в PR.md.",
    files: withPackage({ "change.diff": DIFF }),
    written: PR,
  },
  ruSite: {
    id: "ru-site",
    prompt: "Напиши для site/about.md абзац, который объясняет владельцу небольшого бизнеса, что Ledger для него делает. Факты в facts.md. Один абзац, без заголовка.",
    files: withPackage({ "facts.md": FACTS_RU, "site/about.md": "" }),
    written: SITE,
  },
  ruErrors: {
    id: "ru-errors",
    prompt: "Напиши по-русски сообщения об ошибках для экрана импорта в src/messages.json: объект, где каждому коду ошибки из errors.md соответствует его сообщение. Плейсхолдеры {columns} и {date} сохрани.",
    files: withPackage({ "errors.md": ERRORS_RU }),
    written: MESSAGES,
  },
  ruDocs: {
    id: "ru-docs",
    prompt: "Напиши по-русски docs/import.md, страницу, которая показывает пользователю Ledger, как импортировать CSV-выгрузку банка, по заметкам из notes.txt.",
    files: withPackage({ "notes.txt": IMPORT_RU }),
    written: IMPORT_PAGE,
  },
} as const satisfies Record<string, LedgerTask>;

export const README_SHAPE = docShape([/bun install/, /bun test/], false);
export const PAGE_SHAPE = docShape([/bun run import/], true);

export const carriedTasks = (reference: string, check: Check, tasks: readonly LedgerTask[]): EvalCase[] =>
  tasks.map(({ written, ...task }) => ({ ...task, rule: reference, delivery: { kind: "carried" }, judge: judgedBy(reference, check, written) }));

const RULE_DELIVERY = {
  kind: "rule",
  references: ["technical-writing", "plain-sentences", "plain-words", "punctuation", "unslop", "russian-prose", "writing-for-agents", "interface-copy"],
} as const;

export const ruleTasks = (rule: string, checked: ReadonlyArray<readonly [LedgerTask, Check]>): EvalCase[] =>
  checked.map(([{ written, ...task }, check]) => ({ ...task, rule, delivery: RULE_DELIVERY, judge: judgedBy(rule, check, written) }));
