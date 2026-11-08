import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Schema } from "effect";
import { skipReason } from "@avi2dg/checks/scripts/test-skips.ts";
import { trackedFiles } from "./lib/git";

const repo = new URL("../../", import.meta.url).pathname;
const ALLOWLIST = "tests/fixtures/fleet-names.json";
// CHANGELOG.md is written from commit subjects, so it repeats history no edit to the tree can reach.
const UNSCANNED = new Set(["CHANGELOG.md"]);

const FLEET_NAMES = [
  String.raw`firstmate`,
  String.raw`secondmate`,
  String.raw`captain`,
  String.raw`herdr`,
  String.raw`clauth`,
  String.raw`no[-_]mistakes`,
  String.raw`\borc\b`,
  String.raw`\bfm_task`,
  String.raw`claude-accounts`,
  String.raw`\b[a-z][\w-]*-axi\b`,
  String.raw`["'\`](?:mac|windows)["'\`]`,
  String.raw`\.mac\.`,
  String.raw`\bthe (?:mac|windows machine)\b`,
  String.raw`\bProjects/`,
  String.raw`\bdotfiles\b`,
];
const fleetName = new RegExp(FLEET_NAMES.join("|"), "gi");

const namesIn = (text: string): string[] => [...text.matchAll(fleetName)].map(([name]) => name);

const decodeAllowlist = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))));
const allowlist = decodeAllowlist(await Bun.file(repo + ALLOWLIST).json());

const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
const privateNamesFile =
  process.env.SKILLS_FLEET_NAMES_FILE ??
  join(process.env.XDG_CONFIG_HOME ?? join(process.env.HOME ?? "", ".config"), "skills/fleet-names.txt");
const privateAllowlistFile = join(dirname(privateNamesFile), "fleet-names-allow.json");
const privateNames = existsSync(privateNamesFile)
  ? (await Bun.file(privateNamesFile).text()).split("\n").map((line) => line.trim()).filter(Boolean)
  : undefined;
const privateAllowlist =
  privateNames !== undefined && existsSync(privateAllowlistFile)
    ? decodeAllowlist(await Bun.file(privateAllowlistFile).json())
    : {};
const privateName = privateNames === undefined || privateNames.length === 0 ? undefined : new RegExp(privateNames.map(escapeRegExp).join("|"), "gi");
const privateNamesIn = (text: string): string[] =>
  privateName === undefined ? [] : [...text.matchAll(privateName)].map(([name]) => name);

const scanned = (await trackedFiles(repo)).filter((path) => !UNSCANNED.has(path) && existsSync(repo + path));
const texts = await Promise.all(scanned.map(async (path) => [path, `${path}\n${await Bun.file(repo + path).text()}`] as const));
const named = new Map(texts.map(([path, text]) => [path, namesIn(text)] as const).filter(([, names]) => names.length > 0));
const privateNamed = new Map(
  texts.map(([path, text]) => [path, privateNamesIn(text)] as const).filter(([, names]) => names.length > 0),
);

test("the scan matches every fleet name in its brief and none of the words that only contain one", () => {
  const fleet = [
    "firstmate",
    "FIRSTMATE_OP",
    "secondmate",
    "the captain's",
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
    '"mac"',
    "'windows'",
    "config.mac.yaml",
    "on the Mac",
    "the Windows machine",
    "Projects/skills",
    "dotfiles",
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

test.skipIf(privateNames === undefined)(
  skipReason(
    "no private names file is configured so only the public names are scanned",
    "no tracked file names a private name more often than the private allowlist lets it",
  ),
  () => {
    const over = [...privateNamed]
      .filter(([path, names]) => names.length > (privateAllowlist[path] ?? 0))
      .map(([path, names]) => `${path}: ${names.length} > ${privateAllowlist[path] ?? 0} (${[...new Set(names)].join(", ")})`);
    expect(over, `a file names an owner-specific name; take it from user config instead`).toEqual([]);
  },
);

test.skipIf(privateNames === undefined)(
  skipReason(
    "no private names file is configured so only the public names are scanned",
    "the private allowlist lets no file name a private name more often than it does, so a fix lowers the count it removes",
  ),
  () => {
    const slack = Object.entries(privateAllowlist)
      .filter(([path, allowed]) => allowed > (privateNamed.get(path)?.length ?? 0))
      .map(([path, allowed]) => `${path}: ${allowed} > ${privateNamed.get(path)?.length ?? 0}`);
    expect(slack, `lower these in ${privateAllowlistFile}`).toEqual([]);
  },
);
