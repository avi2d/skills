import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { SCHEMA } from "../../src/bodies/bodies";
import { linkPage, pages, parseRecord, recordIndex, withLinks, withTemplates, type DecisionRecord } from "../../src/docs/docs";
import { REPO } from "../../src/generate/link";
import { DECLARATIONS } from "../../src/dispatcher/project";
import { PREDICATES } from "../../src/dispatcher/scope-condition";
import { SELECTION_PATH, parseSelection } from "../../src/bodies/selection";
import { said, value, valueOf } from "../lib/effect";

const written = await valueOf(pages(REPO));

test.each(written.map((page) => [page.path, page.text] as const))(
  "%s is committed as `bun run docs` writes it",
  async (path, text) => {
    const committed = await Bun.file(`${REPO}${path}`).text();
    expect(committed, `${path} disagrees with what it is generated from: run \`bun run docs\` and commit the result`).toBe(text);
  },
);

const recorded = (number: number, title: string, status: string) =>
  [`# ${number}. ${title}`, "", "Date: 2026-09-24", "", "## Status", "", status, "", "## Context", "", "Why."].join("\n");

const filed = (number: number, title: string, status: string): DecisionRecord =>
  value(parseRecord(`${String(number).padStart(4, "0")}-a-record.md`, recorded(number, title, status)));

describe("a record", () => {
  test("gives the index its number, its title, and the first word of its status", () => {
    const record = filed(7, "A thing is decided", "Superseded by 0009, which\nundoes it.");
    expect([record.number, record.title, record.state]).toEqual([7, "A thing is decided", "Superseded"]);
  });

  test("opening its status with a word the index does not know is refused, naming the record", () => {
    const message = said(parseRecord("0007-a-record.md", recorded(7, "A thing", "Proposed.")));
    expect(message).toContain("docs/adr/0007-a-record.md");
    expect(message).toContain("`Proposed`");
  });

  test("with no Status section is refused rather than indexed with an empty one", () => {
    const message = said(parseRecord("0007-a-record.md", "# 7. A thing\n\n## Context\n\nWhy.\n"));
    expect(message).toContain("no `## Status` section");
  });

  test("with no numbered heading is refused rather than indexed untitled", () => {
    expect(said(parseRecord("0007-a-record.md", "A thing\n\n## Status\n\nAccepted.\n"))).toContain("heading");
  });
});

describe("the index", () => {
  const records = [
    filed(1, "First", "Accepted. Amended by 0003, which narrows it. Follows #2, and not 2003."),
    filed(2, "Second | with a bar", "Superseded by `0003-a-record.md`."),
    filed(3, "Third", "Accepted. Supersedes 0002 and amends 0001. 0004 has since narrowed it."),
  ];
  const rows = recordIndex(records.toReversed())
    .split("\n")
    .filter((line) => line.startsWith("| ["));

  test("lists every record once, in the order of their numbers", () => {
    expect(rows.map((row) => row.slice(0, 8))).toEqual(["| [0001]", "| [0002]", "| [0003]"]);
  });

  test("names as revising a record each later record its status cites, and nothing else it cites", () => {
    expect(rows[0]).toEndWith("| Accepted | [0003](0003-a-record.md) |");
    expect(rows[1]).toEndWith("| Superseded | [0003](0003-a-record.md) |");
    expect(rows[2], "an earlier record, or a number no record holds, revised this one").toEndWith("| Accepted |  |");
  });

  test("keeps a bar in a title inside its cell", () => {
    expect(rows[1]).toContain("| Second \\| with a bar |");
  });
});

const LINKED = { ".a/settings.json": "harness/a/settings.json", "it's/here": "generated/skills" };
const MERGED_FILES = { ".b/settings.json": { from: "harness/b/settings.json", ownKeys: ["deviceId", "seenVersion"] } };

describe("the link page", () => {
  const page = linkPage(
    { mac: { ...LINKED, ".b/rules.json": "harness/b/rules.mac.json" }, windows: { ...LINKED, ".b/rules.json": "harness/b/rules.json" } },
    MERGED_FILES,
    [".a/old"],
  );

  test("pairs each path in $HOME with the path in this checkout it points at", () => {
    expect(page).toContain("| `~/.a/settings.json` | `harness/a/settings.json` |");
    expect(page).toContain("| `~/it's/here` | `generated/skills` |");
  });

  test("names only the Mac's target for a path only the Mac links", () => {
    const macOnly = linkPage(
      { mac: { ...LINKED, "only/mac": "harness/only/mac" }, windows: { ...LINKED } },
      MERGED_FILES,
      [],
    );
    expect(macOnly).toContain("| `~/only/mac` | `harness/only/mac` on the Mac |");
  });

  test("names each machine's target for a path whose target differs by machine", () => {
    expect(page).toContain(
      "| `~/.b/rules.json` | `harness/b/rules.mac.json` on the Mac, `harness/b/rules.json` on the Windows machine and any other |",
    );
  });

  test("pairs each file the linker writes with its source in this checkout and the keys it keeps from the file there", () => {
    expect(page).toContain("| `~/.b/settings.json` | `harness/b/settings.json` | `deviceId`, `seenVersion` |");
  });

  test("lists each retired path among the ones the linker takes back, and not among the links", () => {
    expect(page).toContain("- `~/.a/old`");
    expect(page).not.toContain("| `~/.a/old` |");
  });

  test("declares itself a reference page, which the docs gate requires of a page under docs/", () => {
    expect(page.startsWith("---\nkind: reference\n---\n# The link map\n")).toBe(true);
  });

  test("leaves uninstalling to the README", () => {
    expect(page).not.toContain("```sh");
  });
});

describe("the README's lists of what `bun run link` owns", () => {
  const owned = "<!-- `bun run docs` writes the list below from `LINKS` and `MERGED` in `src/generate/link.ts`. -->";
  const script = "<!-- `bun run docs` writes the script below from `LINKS` and `RETIRED` in `src/generate/link.ts`. -->";
  const readme = ["# a", owned, "- `~/.gone`", "<!-- The list above ends here. -->", "Between.", script, "<!-- The script above ends here. -->", ""].join("\n");
  const spliced = value(withLinks(readme, LINKED, MERGED_FILES, [".a/old"]));
  const lines = spliced.split("\n");
  const shell = /```sh\n([\s\S]*?)```/.exec(spliced)?.[1] ?? expect.unreachable("the README holds no sh block");

  test("install every mapped path in map order, then each written file, none retired and nothing the map no longer holds", () => {
    expect(lines.slice(1, 6)).toEqual([
      owned,
      "- `~/.a/settings.json`",
      "- `~/it's/here`",
      "- `~/.b/settings.json`, written from `harness/b/settings.json` rather than linked",
      "<!-- The list above ends here. -->",
    ]);
  });

  test("uninstall every path the map holds or retired, and leave each written file with the machine's own keys", () => {
    expect(shell.split("\n").slice(1, 5)).toEqual(["for path in \\", "  '.a/settings.json' \\", "  'it'\\''s/here' \\", "  '.a/old'"]);
    expect(shell).not.toContain(".b/settings.json");
  });

  test("leave what lies outside their markers as it was", () => {
    expect(lines[0]).toBe("# a");
    expect(lines).toContain("Between.");
    expect(spliced).toEndWith("```\n<!-- The script above ends here. -->\n");
  });

  test("are refused when the README has lost the markers around one, rather than left stale", () => {
    expect(said(withLinks(readme.replace(script, ""), LINKED, MERGED_FILES, []))).toContain("README.md has lost the markers around its uninstall script");
  });
});

const read = (path: string) => Bun.file(`${REPO}${path}`).text();

const CODE = /`([^`]+)`/g;

const firstCells = (text: string) =>
  text
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .flatMap((row) => Array.from((row.split("|")[1] ?? "").matchAll(CODE), ([, code]) => code ?? ""));

const sectionOf = (text: string, heading: string) => text.split("\n## ").find((section) => section.startsWith(`${heading}\n`)) ?? expect.unreachable(`no ## ${heading}`);

describe("the reference pages", () => {
  test("list every frontmatter field the generator reads, and none it refuses", async () => {
    expect(firstCells(await read("docs/frontmatter.md")).toSorted()).toEqual([...SCHEMA].toSorted());
  });

  test("give every trigger predicate a section, and every key `declares` reads a row", async () => {
    const page = await read("docs/triggers.md");
    const headed = Array.from(page.matchAll(/^## `([a-z-]+)`$/gm), ([, name]) => name);
    expect(headed).toEqual([...PREDICATES]);
    expect(firstCells(sectionOf(page, "`declares`"))).toEqual([...DECLARATIONS]);
  });
});

const AgentRules = Schema.fromJsonString(
  Schema.Struct({
    skills: Schema.Struct({
      rules: Schema.Struct({ on: Schema.optionalKey(Schema.Array(Schema.String)), off: Schema.Array(Schema.String) }),
    }),
  }),
);

test("the README's skills.rules example switches on only Rules that are off by default, and off Rules that are on", async () => {
  const example = /```json\n(.*"skills".*)\n```/.exec(await read("README.md"))?.[1] ?? expect.unreachable("the README shows no skills.rules example");
  const { skills } = Schema.decodeSync(AgentRules)(`{${example}}`);
  const { rules } = skills;
  const { profiles } = await valueOf(parseSelection(await read(SELECTION_PATH)));
  const named = new Set(profiles.flatMap((profile) => profile.rules));
  const on = rules.on ?? [];
  expect(on.map((rule) => [rule, named.has(rule)])).toEqual(on.map((rule) => [rule, false]));
  expect(rules.off.length, "the example switches nothing off, so this proves nothing").toBeGreaterThan(0);
  expect(rules.off.map((rule) => [rule, named.has(rule)])).toEqual(rules.off.map((rule) => [rule, true]));
});

describe("the technical-writing reference's list of templates", () => {
  const open = "<!-- `bun run docs` writes the list below from the installed kit's templates directory. -->";
  const close = "<!-- The list above ends here. -->";
  const reference = ["Before.", open, "- `gone.md`", close, "After."].join("\n");

  test("is every Markdown file in the kit's templates directory, sorted, and nothing it no longer ships", () => {
    expect(value(withTemplates(reference, ["readme.md", "adr.md", "notes.txt"]))).toBe(
      ["Before.", open, "- `adr.md`", "- `readme.md`", close, "After."].join("\n"),
    );
  });

  test("is refused when the kit ships no template, rather than written empty", () => {
    expect(said(withTemplates(reference, []))).toContain("holds no template");
  });

  test("is refused when the reference has lost its markers, rather than left stale", () => {
    expect(said(withTemplates("Before.\n- `adr.md`\nAfter.", ["adr.md"]))).toContain("lost the markers");
  });
});
