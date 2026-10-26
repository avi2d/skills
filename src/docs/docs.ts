import { Effect, Schema, type FileSystem } from "effect";
import { DEFAULT_GENERATED_ROOT } from "../generate/bundle";
import { PROFILE_PAGE, profileSizes, renderProfiles } from "../context/context-profiles";
import { SWEEP_PAGE, SWEEPS, sweepPage, sweepRecords } from "../eval/eval-sweeps";
import { MalformedBody, MalformedRecord, fileFailure, type FileFailure, type MalformedSelection, type UncomposableBodies } from "../platform/failures";
import { attempt } from "../platform/files";
import { active } from "../generate/generate";
import { MERGED, REPO, RETIRED, linksUnder, type LinkMap, type Merge } from "../generate/link";
import { MACHINES, type Machine } from "../generate/machine";
import { main } from "../platform/platform";

export const RECORDS = "docs/adr";
export const RECORD_INDEX = `${RECORDS}/README.md`;
export const LINK_PAGE = "docs/links.md";
export const README = "README.md";
const WRITING_REFERENCE = "library/writing/references/technical-writing/SKILL.md";
const KIT_TEMPLATE = "@avi2dg/checks/templates/readme.md";
const KIT_TEMPLATES = "@avi2dg/checks/templates/*";

const kitTemplatesDir = (): Effect.Effect<string, FileFailure> =>
  Effect.try({
    try: () => {
      const resolved = new URL(import.meta.resolve(KIT_TEMPLATE)).pathname;
      return resolved.slice(0, resolved.length - "/readme.md".length);
    },
    catch: (cause) => fileFailure(KIT_TEMPLATE, cause),
  });

export type Page = { readonly path: string; readonly text: string };

const STATES = ["Accepted", "Superseded", "Retired"] as const;
const isState = Schema.is(Schema.Literals(STATES));

export type DecisionRecord = {
  readonly file: string;
  readonly number: number;
  readonly title: string;
  readonly state: (typeof STATES)[number];
  readonly status: string;
};

const FILED = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const HEADING = /^# \d+\. (.+)$/;
const CITED = /(?<![\w#])\d{4}(?!\d)/g;

const malformed = (file: string, problem: string) => new MalformedRecord({ message: `${RECORDS}/${file} ${problem}` });

const statusOf = (lines: readonly string[]): string | undefined => {
  const start = lines.indexOf("## Status");
  if (start === -1) return undefined;
  const after = lines.slice(start + 1);
  const end = after.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? after : after.slice(0, end)).join(" ").replace(/\s+/g, " ").trim();
};

export const parseRecord = Effect.fnUntraced(function* (
  file: string,
  text: string,
): Effect.fn.Return<DecisionRecord, MalformedRecord> {
  const filed = FILED.exec(file)?.[1];
  if (filed === undefined) return yield* malformed(file, "is not named as a four-digit number and a kebab-case title");
  const lines = text.split("\n");
  const title = HEADING.exec(lines[0] ?? "")?.[1];
  if (title === undefined) return yield* malformed(file, "does not open with a `# <number>. <title>` heading");
  const status = statusOf(lines);
  if (status === undefined) return yield* malformed(file, "has no `## Status` section");
  const state = /^\w+/.exec(status)?.[0];
  if (!isState(state)) {
    const opened = state === undefined ? "nothing" : `\`${state}\``;
    return yield* malformed(file, `opens its status with ${opened} rather than one of ${STATES.join(", ")}`);
  }
  return { file, number: Number(filed), title, state, status };
});

const padded = (number: number) => String(number).padStart(4, "0");

const cell = (text: string) => text.replaceAll("|", "\\|");

// A record's status names a later record only once it has been edited after that one landed.
const revisers = (record: DecisionRecord, filed: ReadonlyMap<number, DecisionRecord>): DecisionRecord[] =>
  [...new Set(Array.from(record.status.matchAll(CITED), ([digits]) => Number(digits)))]
    .filter((number) => number > record.number)
    .toSorted((a, b) => a - b)
    .flatMap((number) => filed.get(number) ?? []);

export const recordIndex = (records: readonly DecisionRecord[]): string => {
  const filed = new Map(records.map((record) => [record.number, record]));
  const linked = (record: DecisionRecord) => `[${padded(record.number)}](${record.file})`;
  const rows = records
    .toSorted((a, b) => a.number - b.number)
    .map((record) => {
      const revised = revisers(record, filed).map(linked).join(", ");
      return `| ${linked(record)} | ${cell(record.title)} | ${record.state} | ${revised} |`;
    });
  return [
    "# Decision records",
    "",
    "`bun run docs` writes this index from the records beside it, and `bun run test` fails when the two disagree.",
    "",
    "**Status** is the first word of a record's Status section.",
    "**Revised by** lists the later records that section names, which is where a record says what superseded, retired, narrowed or amended part of it.",
    "Read those before acting on the record they revise.",
    "",
    "| Record | Title | Status | Revised by |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
};

const quoted = (path: string) => `'${path.replaceAll("'", "'\\''")}'`;

const inHome = (rel: string) => `\`~/${rel}\``;

type MergeMap = Readonly<Record<string, Merge>>;

type MachineLinks = Readonly<Record<Machine, LinkMap>>;

const ON_MACHINE: Readonly<Record<Machine, string>> = {
  mac: "on the Mac",
  windows: "on the Windows machine and any other",
};

const linksOnEveryMachine = (root: string): MachineLinks => ({ mac: linksUnder(root, "mac"), windows: linksUnder(root, "windows") });

const pointsAt = (links: MachineLinks, rel: string): string => {
  if (links.mac[rel] === links.windows[rel]) return `\`${links.windows[rel]}\``;
  return MACHINES.flatMap((machine) => {
    const target = links[machine][rel];
    return target === undefined ? [] : [`\`${target}\` ${ON_MACHINE[machine]}`];
  }).join(", ");
};

const everyRel = (links: MachineLinks): readonly string[] => [
  ...Object.keys(links.windows),
  ...Object.keys(links.mac).filter((rel) => !(rel in links.windows)),
];

export const linkPage = (links: MachineLinks, merged: MergeMap, retired: readonly string[]): string =>
  [
    "---",
    "kind: reference",
    "---",
    "# The link map",
    "",
    "The link map is every path in $HOME that `bun run link` writes or takes back, and what each one points at in this checkout.",
    "`bun run docs` writes this page from `LINKS`, `MERGED` and `RETIRED` in `src/generate/link.ts`, and `bun run test` fails when the two disagree.",
    "",
    "## The links",
    "",
    "`bun run link` makes each path below a symbolic link to the path beside it in this checkout, creating the directories that hold it.",
    "It repoints a link that points anywhere else, and refuses a path that holds anything other than a link.",
    "A path with a target for each machine points at the Mac's target on macOS and at the other one everywhere else.",
    "A path only one machine links names only that machine's target.",
    `A target under \`${DEFAULT_GENERATED_ROOT}/\` is written by the same run, because a clone arrives without it.`,
    "",
    "| In $HOME | Points at, in this checkout |",
    "| --- | --- |",
    ...everyRel(links).map((rel) => `| ${inHome(rel)} | ${pointsAt(links, rel)} |`),
    "",
    "## The files it writes",
    "",
    "`bun run link` writes each path below as a file of the machine's own, because the harness writes keys of its own into it, and would write them through a link into this checkout.",
    "It keeps each key the last column names from the file already there, and takes every other key from the file in this checkout.",
    "It names each key it replaces, with the value the file held.",
    "When the file in this checkout differs from its last commit only in the keys the harness writes, it restores the file.",
    "",
    "| In $HOME | Written from, in this checkout | Kept from the file already there |",
    "| --- | --- | --- |",
    ...Object.entries(merged).map(([rel, { from, ownKeys }]) => `| ${inHome(rel)} | \`${from}\` | ${ownKeys.map((key) => `\`${key}\``).join(", ")} |`),
    "",
    "## The paths it takes back",
    "",
    "Each path below was once in the map.",
    "`bun run link` removes it when it is still a link into this checkout, and leaves anything else at that path alone.",
    "",
    ...retired.map((rel) => `- ${inHome(rel)}`),
    "",
    "## Related topics",
    "",
    "- [Uninstall](../README.md#uninstall)",
    "- [How a Rule reaches a harness](how-a-rule-reaches-a-harness.md)",
    "",
  ].join("\n");

const uninstallScript = (links: LinkMap, retired: readonly string[]): string[] => {
  const taken = [...Object.keys(links), ...retired];
  return [
    "```sh",
    "root=$(pwd -P)",
    "for path in \\",
    ...taken.map((rel, at) => `  ${quoted(rel)}${at < taken.length - 1 ? " \\" : ""}`),
    "do",
    '  case "$(readlink "$HOME/$path")" in "$root"/*) rm "$HOME/$path" ;; esac',
    "done",
    "```",
  ];
};

type Region = { readonly opens: string; readonly closes: string; readonly holds: string };

const TEMPLATE_LIST: Region = {
  opens: "<!-- `bun run docs` writes the list below from the installed kit's templates directory. -->",
  closes: "<!-- The list above ends here. -->",
  holds: "its list of templates",
};

const OWNED_LIST: Region = {
  opens: "<!-- `bun run docs` writes the list below from `LINKS` and `MERGED` in `src/generate/link.ts`. -->",
  closes: "<!-- The list above ends here. -->",
  holds: "its list of the paths `bun run link` owns",
};

const UNINSTALL_SCRIPT: Region = {
  opens: "<!-- `bun run docs` writes the script below from `LINKS` and `RETIRED` in `src/generate/link.ts`. -->",
  closes: "<!-- The script above ends here. -->",
  holds: "its uninstall script",
};

const spliced = (file: string, text: string, region: Region, lines: readonly string[]): Effect.Effect<string, MalformedBody> => {
  const opened = text.indexOf(`${region.opens}\n`);
  const closed = opened === -1 ? -1 : text.indexOf(region.closes, opened);
  if (closed === -1) return Effect.fail(new MalformedBody({ message: `${file} has lost the markers around ${region.holds}` }));
  const body = opened + region.opens.length + 1;
  return Effect.succeed(`${text.slice(0, body)}${lines.map((line) => `${line}\n`).join("")}${text.slice(closed)}`);
};

export const withTemplates = (reference: string, templates: readonly string[]): Effect.Effect<string, MalformedBody> => {
  const listed = templates.filter((file) => file.endsWith(".md")).toSorted();
  if (listed.length === 0) {
    return Effect.fail(new MalformedBody({ message: `${KIT_TEMPLATES} holds no template, so ${WRITING_REFERENCE} would list none` }));
  }
  return spliced(
    WRITING_REFERENCE,
    reference,
    TEMPLATE_LIST,
    listed.map((file) => `- \`${file}\``),
  );
};

export const withLinks = Effect.fnUntraced(function* (
  readme: string,
  links: LinkMap,
  merged: MergeMap,
  retired: readonly string[],
): Effect.fn.Return<string, MalformedBody> {
  const owned = yield* spliced(README, readme, OWNED_LIST, [
    ...Object.keys(links).map((rel) => `- ${inHome(rel)}`),
    ...Object.entries(merged).map(([rel, { from }]) => `- ${inHome(rel)}, written from \`${from}\` rather than linked`),
  ]);
  return yield* spliced(README, owned, UNINSTALL_SCRIPT, uninstallScript(links, retired));
});

const readmeWithLinks = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<string, FileFailure | MalformedBody, FileSystem.FileSystem> {
  const path = `${repo}${README}`;
  const windows = linksUnder(DEFAULT_GENERATED_ROOT, "windows");
  const links: Record<string, string> = { ...windows };
  for (const [rel, target] of Object.entries(linksUnder(DEFAULT_GENERATED_ROOT, "mac"))) {
    if (!(rel in links)) links[rel] = target;
  }
  return yield* withLinks(yield* attempt(path, (fs) => fs.readFileString(path)), links, MERGED, RETIRED);
});

const writingReference = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<string, FileFailure | MalformedBody, FileSystem.FileSystem> {
  const path = `${repo}${WRITING_REFERENCE}`;
  const dir = yield* kitTemplatesDir();
  const reference = yield* attempt(path, (fs) => fs.readFileString(path));
  return yield* withTemplates(reference, yield* attempt(dir, (fs) => fs.readDirectory(dir)));
});

export const records = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<DecisionRecord[], FileFailure | MalformedRecord, FileSystem.FileSystem> {
  const dir = `${repo}${RECORDS}`;
  const files = (yield* attempt(dir, (fs) => fs.readDirectory(dir))).filter(
    (name) => name.endsWith(".md") && `${RECORDS}/${name}` !== RECORD_INDEX,
  );
  const parsed: DecisionRecord[] = [];
  for (const file of files.toSorted()) {
    const path = `${dir}/${file}`;
    parsed.push(yield* parseRecord(file, yield* attempt(path, (fs) => fs.readFileString(path))));
  }
  return parsed;
});

export const pages = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<Page[], FileFailure | MalformedRecord | MalformedBody | MalformedSelection | UncomposableBodies, FileSystem.FileSystem> {
  const { bodies, profiles } = yield* active(repo);
  return [
    { path: RECORD_INDEX, text: recordIndex(yield* records(repo)) },
    { path: LINK_PAGE, text: linkPage(linksOnEveryMachine(DEFAULT_GENERATED_ROOT), MERGED, RETIRED) },
    { path: README, text: yield* readmeWithLinks(repo) },
    { path: WRITING_REFERENCE, text: yield* writingReference(repo) },
    { path: SWEEP_PAGE, text: sweepPage(yield* sweepRecords(`${repo}${SWEEPS}`)) },
    { path: PROFILE_PAGE, text: renderProfiles(yield* profileSizes(profiles, bodies)) },
  ];
});

if (import.meta.main) {
  main(
    Effect.gen(function* () {
      for (const page of yield* pages(REPO)) {
        const path = `${REPO}${page.path}`;
        yield* attempt(path, (fs) => fs.writeFileString(path, page.text));
        console.log(`wrote ${page.path}`);
      }
    }),
  );
}
