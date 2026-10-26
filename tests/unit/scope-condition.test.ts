import { describe, expect, test } from "bun:test";
import { PREDICATES, parseScopeCondition, parseScopeConditions } from "../../src/dispatcher/scope-condition";
import { said, value } from "../lib/effect";

describe("parseScopeCondition", () => {
  test("the five predicates are exactly the ones every rule can name", () => {
    expect(PREDICATES).toEqual(["always", "repo-contains", "declares", "file-matches", "tool-call"]);
  });

  test("a missing trigger aborts, because such a Rule could never fire", () => {
    expect(said(parseScopeCondition(undefined))).toBe(
      "frontmatter field `trigger` is missing, so this Rule can never fire",
    );
  });

  test("a trigger that is not a block of fields aborts", () => {
    expect(said(parseScopeCondition("always"))).toBe(
      'frontmatter field `trigger` is "always", which is not a block of fields',
    );
  });

  test("a trigger missing its predicate aborts naming it", () => {
    expect(said(parseScopeCondition({}))).toBe("frontmatter field `trigger.predicate` is missing");
  });

  test("a predicate that is not text aborts", () => {
    expect(said(parseScopeCondition({ predicate: 7 }))).toBe(
      "frontmatter field `trigger.predicate` is 7, which is not text",
    );
  });

  test("a predicate that is not one of the five aborts naming it and listing them", () => {
    expect(said(parseScopeCondition({ predicate: "repo-contins" }))).toBe(
      'frontmatter field `trigger.predicate` is "repo-contins", which is not one of always, repo-contains, declares, file-matches, tool-call',
    );
  });

  test("a parameter that does not belong to the predicate aborts naming both", () => {
    expect(said(parseScopeCondition({ predicate: "repo-contains", glob: "**/*.ts", tool: "write" }))).toBe(
      "frontmatter field `trigger.tool` does not belong to a repo-contains trigger",
    );
    expect(said(parseScopeCondition({ predicate: "always", glob: "**/*.ts" }))).toBe(
      "frontmatter field `trigger.glob` does not belong to a always trigger",
    );
  });

  test("each predicate parses with its parameters", () => {
    expect(value(parseScopeCondition({ predicate: "always" }))).toEqual({ predicate: "always" });
    expect(value(parseScopeCondition({ predicate: "repo-contains", glob: "**/*.ts" }))).toEqual({
      predicate: "repo-contains",
      glob: "**/*.ts",
    });
    expect(value(parseScopeCondition({ predicate: "declares", key: "effect" }))).toEqual({
      predicate: "declares",
      key: "effect",
    });
    expect(value(parseScopeCondition({ predicate: "file-matches", glob: "**/*.md" }))).toEqual({
      predicate: "file-matches",
      glob: "**/*.md",
    });
    expect(
      value(
        parseScopeCondition({ predicate: "tool-call", tool: "write", argument: "path", matches: "**/CHANGELOG.md" }),
      ),
    ).toEqual({ predicate: "tool-call", tool: "write", argument: "path", matches: "**/CHANGELOG.md" });
  });

  test("a repo-contains trigger missing its glob aborts naming it", () => {
    expect(said(parseScopeCondition({ predicate: "repo-contains" }))).toBe(
      "frontmatter field `trigger.glob` is missing",
    );
  });

  test("a declares trigger names a declaration package.json can make, or aborts listing them", () => {
    expect(value(parseScopeCondition({ predicate: "declares", key: "effect" }))).toEqual({
      predicate: "declares",
      key: "effect",
    });
    expect(said(parseScopeCondition({ predicate: "declares" }))).toBe("frontmatter field `trigger.key` is missing");
    expect(said(parseScopeCondition({ predicate: "declares", key: "sources.effect" }))).toBe(
      'frontmatter field `trigger.key` is "sources.effect", which is not one of effect',
    );
    expect(said(parseScopeCondition({ predicate: "declares", key: "effect", glob: "**/*.ts" }))).toBe(
      "frontmatter field `trigger.glob` does not belong to a declares trigger",
    );
  });

  test("a malformed glob aborts naming the field and the glob's complaint", () => {
    expect(said(parseScopeCondition({ predicate: "repo-contains", glob: "**/*.{ts,tsx" }))).toBe(
      'frontmatter field `trigger.glob` is a malformed glob "**/*.{ts,tsx" opens a { alternation and never closes it',
    );
    expect(
      said(parseScopeCondition({ predicate: "tool-call", tool: "write", argument: "path", matches: "{oops" })),
    ).toBe(
      'frontmatter field `trigger.matches` is a malformed glob "{oops" opens a { alternation and never closes it',
    );
  });

  test("a tool-call trigger missing a parameter aborts naming it", () => {
    expect(said(parseScopeCondition({ predicate: "tool-call", argument: "path", matches: "x" }))).toBe(
      "frontmatter field `trigger.tool` is missing",
    );
    expect(said(parseScopeCondition({ predicate: "tool-call", tool: "write", matches: "x" }))).toBe(
      "frontmatter field `trigger.argument` is missing",
    );
    expect(said(parseScopeCondition({ predicate: "tool-call", tool: "write", argument: "path" }))).toBe(
      "frontmatter field `trigger.matches` is missing",
    );
  });
});

describe("parseScopeConditions", () => {
  test("a single trigger parses whole without a list", () => {
    expect(value(parseScopeConditions({ predicate: "always" }))).toEqual([{ predicate: "always" }]);
  });

  test("an empty list aborts, because such a Rule could never fire", () => {
    expect(said(parseScopeConditions([]))).toBe(
      "frontmatter field `trigger` is an empty list, so this Rule can never fire",
    );
  });

  test("a list parses whole in declared order", () => {
    expect(
      value(parseScopeConditions([{ predicate: "always" }, { predicate: "file-matches", glob: "**/*.md" }])),
    ).toEqual([{ predicate: "always" }, { predicate: "file-matches", glob: "**/*.md" }]);
  });

  test("a malformed entry is named by its place in the list", () => {
    expect(said(parseScopeConditions([{ predicate: "always" }, { predicate: "file-matches" }]))).toBe(
      "frontmatter field `trigger[1].glob` is missing",
    );
  });
});
