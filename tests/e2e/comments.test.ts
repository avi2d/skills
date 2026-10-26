import { expect, test } from "bun:test";
import { loadBodies } from "../../src/bodies/bodies";
import { matchesGlob } from "../../src/dispatcher/glob";
import { SYNTAXES, commentsIn, refused, syntaxOf } from "@avi2dg/checks/scripts/comment-matchers.ts";
import { trackedFiles } from "./lib/git";
import { valueOf } from "../lib/effect";

const repo = new URL("../../", import.meta.url).pathname;

const rule = (await valueOf(loadBodies(repo))).find((body) => body.name === "comment-discipline");
if (rule?.kind !== "rule") throw new Error("`comment-discipline` is not a Rule in this tree, so these checks cover nothing");

const globs = rule.trigger.map((condition) => ("glob" in condition ? condition.glob : "**/*"));
const code = (await trackedFiles(repo)).filter((path) => globs.some((glob) => matchesGlob(glob, path)));

test("the Rule's own trigger picks the files these checks read, and it picks some", () => {
  expect(code, "no tracked file matches the Rule's trigger, so every check below passes on an empty set").not.toEqual([]);
  expect(code, "the generator and its suite are code the Rule covers").toContain("src/dispatcher/dispatch.ts");
  expect(code, "a harness extension is code the Rule covers").toContain("harness/pi/extensions/web-tools.ts");
});

test("every extension the checks know how to read is one the Rule's trigger fires on", () => {
  const stray = Object.keys(SYNTAXES).filter((extension) => !globs.some((glob) => matchesGlob(glob, `a/b.${extension}`)));
  expect(stray, "a comment syntax is declared for a file the Rule never reaches").toEqual([]);
});

test("this repository's code holds comments, so a scanner that found none would not pass", async () => {
  const seen = await Promise.all(
    code.map(async (path) =>
      commentsIn(await Bun.file(repo + path).text(), syntaxOf(path) ?? expect.unreachable(`${path} is code the matchers cannot read`)),
    ),
  );
  expect(seen.flat().length, "the scanner read every file in this repository and found no comment at all").toBeGreaterThan(5);
});

test("no comment in this repository's code is one the checks refuse", async () => {
  const found = await Promise.all(code.map(async (path) => refused(path, await Bun.file(repo + path).text())));
  expect(found.flat()).toEqual([]);
});
