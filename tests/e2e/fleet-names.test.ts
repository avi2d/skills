import { expect, test } from "bun:test";
import { Schema } from "effect";
import { trackedFiles } from "./lib/git";

const repo = new URL("../../", import.meta.url).pathname;
const SELF = "tests/e2e/fleet-names.test.ts";
const ALLOWLIST = "tests/fixtures/fleet-names.json";
// CHANGELOG.md is written from commit subjects, so it repeats history no edit to the tree can reach.
const UNSCANNED = new Set([SELF, ALLOWLIST, "CHANGELOG.md"]);

const FLEET_NAMES = [
  String.raw`firstmate`,
  String.raw`secondmate`,
  String.raw`captain`,
  String.raw`winbox`,
  String.raw`herdr`,
  String.raw`clauth`,
  String.raw`no[-_]mistakes`,
  String.raw`\borc\b`,
  String.raw`\bfm_task`,
  String.raw`claude-accounts`,
  String.raw`\b[a-z][\w-]*-axi\b`,
  String.raw`/home/avi2d\b`,
  String.raw`/Users/avi2d\b`,
  String.raw`avi2d-nm`,
  String.raw`["'\`](?:mac|windows)["'\`]`,
  String.raw`\.mac\.`,
  String.raw`\bthe (?:mac|windows machine)\b`,
];
const fleetName = new RegExp(FLEET_NAMES.join("|"), "gi");

const namesIn = (text: string): string[] => [...text.matchAll(fleetName)].map(([name]) => name);

const decodeAllowlist = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))));
const allowlist = decodeAllowlist(await Bun.file(repo + ALLOWLIST).json());

const scanned = (await trackedFiles(repo)).filter((path) => !UNSCANNED.has(path));
const named = new Map(
  (await Promise.all(scanned.map(async (path) => [path, namesIn(`${path}\n${await Bun.file(repo + path).text()}`)] as const)))
    .filter(([, names]) => names.length > 0),
);

test("the scan matches every fleet name in its brief and none of the words that only contain one", () => {
  const fleet = [
    "firstmate",
    "FIRSTMATE_OP",
    "secondmate",
    "the captain's",
    "winbox",
    "HERDR_PANE_ID",
    "clauth",
    "no-mistakes",
    "no_mistakes",
    "orc chat",
    "~/.orc",
    "FM_TASK_INBOX",
    "~/.claude-accounts",
    "gh-axi",
    "quota-axi",
    "/home/avi2d/x",
    "/Users/avi2d",
    "avi2d-nm-evidence",
    '"mac"',
    "'windows'",
    "config.mac.yaml",
    "on the Mac",
    "the Windows machine",
  ];
  const plain = ["force", "orchestrate", "machine", "macro", "Windows Terminal", "taxi", "github.com/avi2d/skills", "@avi2dg/checks"];
  expect(fleet.filter((text) => namesIn(text).length !== 1)).toEqual([]);
  expect(plain.filter((text) => namesIn(text).length > 0)).toEqual([]);
});

test("the scan reads the tracked tree, so an empty listing cannot pass it", () => {
  expect(scanned).toContain("src/generate/link.ts");
  expect(scanned).toContain("harness/claude-code/settings.json");
});

test("no tracked file names the fleet more often than the allowlist lets it", () => {
  const over = [...named]
    .filter(([path, names]) => names.length > (allowlist[path] ?? 0))
    .map(([path, names]) => `${path}: ${names.length} > ${allowlist[path] ?? 0} (${[...new Set(names)].join(", ")})`);
  expect(over, "a file names a machine, account, fleet tool or private path; take it from user config instead").toEqual([]);
});

test("the allowlist lets no file name the fleet more often than it does, so a fix lowers the count it removes", () => {
  const slack = Object.entries(allowlist)
    .filter(([path, allowed]) => allowed > (named.get(path)?.length ?? 0))
    .map(([path, allowed]) => `${path}: ${allowed} > ${named.get(path)?.length ?? 0}`);
  expect(slack, `lower these in ${ALLOWLIST}`).toEqual([]);
});
