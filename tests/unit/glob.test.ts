import { describe, expect, test } from "bun:test";
import { compileGlob, matchesGlob } from "../../src/dispatcher/glob";

describe("compileGlob", () => {
  test("a literal matches only itself", () => {
    expect(matchesGlob("abc", "abc")).toBe(true);
    expect(matchesGlob("abc", "abd")).toBe(false);
  });

  test("a regex metacharacter in the glob stays literal", () => {
    expect(matchesGlob("a.c", "a.c")).toBe(true);
    expect(matchesGlob("a.c", "abc")).toBe(false);
  });

  test("a single star spans within a segment but never crosses a slash", () => {
    expect(matchesGlob("*.ts", "a.ts")).toBe(true);
    expect(matchesGlob("*.ts", "a/b.ts")).toBe(false);
  });

  test("a double star crosses slashes", () => {
    expect(matchesGlob("**/*.ts", "a/b.ts")).toBe(true);
    expect(matchesGlob("**/*.ts", "a.ts")).toBe(true);
  });

  test("a double star before a name still needs the separator between them", () => {
    expect(matchesGlob("**/b", "a/b")).toBe(true);
    expect(matchesGlob("**/b", "ab")).toBe(false);
  });

  test("a question mark spans exactly one character and never a slash", () => {
    expect(matchesGlob("a?c", "abc")).toBe(true);
    expect(matchesGlob("a?c", "ac")).toBe(false);
    expect(matchesGlob("a?c", "abbc")).toBe(false);
    expect(matchesGlob("a?c", "a/c")).toBe(false);
  });

  test("braces alternate between their branches", () => {
    expect(matchesGlob("{a,b}", "a")).toBe(true);
    expect(matchesGlob("{a,b}", "b")).toBe(true);
    expect(matchesGlob("{a,b}", "c")).toBe(false);
    expect(matchesGlob("a{b,c}d", "abd")).toBe(true);
    expect(matchesGlob("a{b,c}d", "aad")).toBe(false);
  });

  test("a comma outside braces stays literal", () => {
    expect(matchesGlob("a,b", "a,b")).toBe(true);
    expect(matchesGlob("a,b", "a")).toBe(false);
  });

  test("a closing brace with nothing to close stays literal", () => {
    expect(matchesGlob("a}", "a}")).toBe(true);
  });

  test("an exclusion matches whatever its branches do not, within one segment", () => {
    const people = "**/docs/**/!(SKILL|AGENTS|CLAUDE).md";
    expect(matchesGlob(people, "docs/guide.md")).toBe(true);
    expect(matchesGlob(people, "/work/docs/adr/0001-a-record.md")).toBe(true);
    expect(matchesGlob(people, "docs/MY-SKILL.md")).toBe(true);
    expect(matchesGlob(people, "docs/SKILL.md.md")).toBe(true);
    expect(matchesGlob(people, "docs/AGENTS.md")).toBe(false);
    expect(matchesGlob(people, "docs/x/SKILL.md")).toBe(false);
    expect(matchesGlob(people, "/work/docs/CLAUDE.md")).toBe(false);
    expect(matchesGlob("a!b", "a!b")).toBe(true);
  });

  test("a malformed part after or inside an exclusion aborts naming the whole glob", () => {
    expect(() => compileGlob("docs/!(a)/{b")).toThrow('glob "docs/!(a)/{b" opens a { alternation and never closes it');
    expect(() => compileGlob("!(a{b)")).toThrow('glob "!(a{b)" opens a { alternation and never closes it');
    expect(() => compileGlob("!(a)!(b")).toThrow('glob "!(a)!(b" opens a !( exclusion and never closes it');
  });

  test("an exclusion inside braces aborts naming the glob", () => {
    expect(() => compileGlob("{!(a),b}")).toThrow('glob "{!(a),b}" puts a !( exclusion inside a { alternation');
  });

  test("an unclosed brace aborts naming the glob", () => {
    expect(() => compileGlob("**/*.{ts,tsx")).toThrow(
      'glob "**/*.{ts,tsx" opens a { alternation and never closes it',
    );
  });
});
