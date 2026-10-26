import { passedHiddenVerifier } from "../../../src/eval/eval-judges";
import { withPackage, type EvalCase } from "../fixture";

const VERIFIES = ["bun", "test", "./hidden-verifier/outcome.test.ts"] as const;

const IGNORE_SEED = `function toRegExp(glob: string): RegExp {
  const source = glob.replace(/[.+^\${}()|[\\]\\\\]/g, "\\\\$&").replace(/\\*/g, ".*").replace(/\\?/g, ".");
  return new RegExp(\`^\${source}$\`);
}

export function isIgnored(path: string, patterns: readonly string[]): boolean {
  let ignored = false;
  for (const line of patterns) {
    const negated = line.startsWith("!");
    const glob = negated ? line.slice(1) : line;
    const name = glob.includes("/") ? path : (path.split("/").at(-1) ?? path);
    if (toRegExp(glob.replace(/^\\//, "")).test(name)) ignored = !negated;
  }
  return ignored;
}
`;

const IGNORE_FIX = `type Rule = { negated: boolean; directoryOnly: boolean; anchored: boolean; matches: RegExp };

const CLASSES: Readonly<Record<string, string>> = {
  alnum: "a-zA-Z0-9",
  alpha: "a-zA-Z",
  blank: " \\\\t",
  cntrl: "\\\\x00-\\\\x1f\\\\x7f",
  digit: "0-9",
  graph: "\\\\x21-\\\\x7e",
  lower: "a-z",
  print: "\\\\x20-\\\\x7e",
  punct: "!-\\\\/:-@\\\\[-\`{-~",
  space: " \\\\t\\\\n\\\\r\\\\f\\\\v",
  upper: "A-Z",
  xdigit: "0-9A-Fa-f",
};

const literal = (char: string): string => char.replace(/[.*+?^\${}()|[\\]\\\\/-]/g, "\\\\$&");

function bracketAt(glob: string, start: number): { source: string; end: number } | undefined {
  let at = start + 1;
  const negated = glob[at] === "!" || glob[at] === "^";
  if (negated) at++;
  let body = "";
  let first = true;
  while (at < glob.length && (glob[at] !== "]" || first)) {
    first = false;
    const named = /^\\[:([a-z]+):\\]/.exec(glob.slice(at));
    if (named) {
      const range = CLASSES[named[1] ?? ""];
      if (range === undefined) return undefined;
      body += range;
      at += named[0].length;
      continue;
    }
    let char = glob[at] ?? "";
    if (char === "\\\\") char = glob[++at] ?? "";
    at++;
    if (glob[at] === "-" && glob[at + 1] !== undefined && glob[at + 1] !== "]") {
      let to = glob[at + 1] ?? "";
      at += 2;
      if (to === "\\\\") to = glob[at++] ?? "";
      body += \`\${literal(char)}-\${literal(to)}\`;
    } else body += literal(char);
  }
  if (at >= glob.length) return undefined;
  return { source: negated ? \`[^/\${body}]\` : \`(?!/)[\${body}]\`, end: at + 1 };
}

function toRegExp(glob: string): RegExp {
  let source = "";
  for (let at = 0; at < glob.length; ) {
    const char = glob[at] ?? "";
    if (char === "\\\\") {
      source += literal(glob[at + 1] ?? "");
      at += 2;
    } else if (char === "*") {
      let end = at;
      while (glob[end] === "*") end++;
      const segmentStart = at === 0 || glob[at - 1] === "/";
      const segmentEnd = end === glob.length || glob[end] === "/";
      if (end - at >= 2 && segmentStart && segmentEnd) {
        if (end === glob.length) source += ".*";
        else {
          source += "(?:.*/)?";
          end++;
        }
      } else source += "[^/]*";
      at = end;
    } else if (char === "?") {
      source += "[^/]";
      at++;
    } else if (char === "[") {
      const bracket = bracketAt(glob, at);
      source += bracket ? bracket.source : literal(char);
      at = bracket ? bracket.end : at + 1;
    } else {
      source += literal(char);
      at++;
    }
  }
  return new RegExp(\`^\${source}$\`);
}

function trimmed(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === " ") {
    let escapes = 0;
    while (line[end - 2 - escapes] === "\\\\") escapes++;
    if (escapes % 2 === 1) break;
    end--;
  }
  return line.slice(0, end);
}

function ruleOf(line: string): Rule | undefined {
  if (line.startsWith("#")) return undefined;
  const text = trimmed(line);
  const negated = text.startsWith("!");
  const body = negated ? text.slice(1) : text;
  const directoryOnly = body.endsWith("/");
  const glob = directoryOnly ? body.slice(0, -1) : body;
  if (glob === "") return undefined;
  return { negated, directoryOnly, anchored: glob.includes("/"), matches: toRegExp(glob.replace(/^\\//, "")) };
}

function excluded(path: string, isDirectory: boolean, rules: readonly Rule[]): boolean {
  const name = path.split("/").at(-1) ?? path;
  let verdict = false;
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) continue;
    if (rule.matches.test(rule.anchored ? path : name)) verdict = !rule.negated;
  }
  return verdict;
}

export function isIgnored(path: string, patterns: readonly string[]): boolean {
  const rules = patterns.flatMap((line) => ruleOf(line) ?? []);
  const segments = path.split("/");
  for (let depth = 1; depth < segments.length; depth++) {
    if (excluded(segments.slice(0, depth).join("/"), true, rules)) return true;
  }
  return excluded(path, false, rules);
}
`;

const IGNORE_WRONG = IGNORE_FIX.replace('  if (line.startsWith("#")) return undefined;\n', "").replace("const text = trimmed(line);", "const text = line;");

// The files git 2.54 lists as ignored by `git ls-files --others --ignored --exclude-standard` when the root .gitignore holds each set of patterns.
const GIT_IGNORES = {
  files: ["build/app.js", "build/lib/util.js", "src/build/gen.js", "src/app.ts", "src/app.test.ts", "src/lib/app.test.ts", "docs/a.txt", "docs/api/b.txt", "a/docs/c.txt", "logs/debug.log", "logs/keep.log", "logs/2026/err.log", "keep.log", "app.log", "foo", "foo.bar", "bar/foo/baz.txt", "deep/a/b/x.tmp", "x.tmp", "a/b", "a/x/b", "a/x/y/b", "node_modules/pkg/index.js", "packages/web/node_modules/react/index.js", ".env", ".env.local", "config/.env", "abc/d.md", "ab/c/d.md", "readme.md", "out/readme.md", "#notes.md", "!readme.txt", "a b.txt", "file1.txt", "file2.txt", "fileA.txt", "x[1].txt", "x1.txt", "data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv", "Makefile", "makefile", "src/Main.ts", "docs/notes #2.md"],
  sets: [
    [["build/"], ["build/app.js", "build/lib/util.js", "src/build/gen.js"]],
    [["/build"], ["build/app.js", "build/lib/util.js"]],
    [["build"], ["build/app.js", "build/lib/util.js", "src/build/gen.js"]],
    [["build/*"], ["build/app.js", "build/lib/util.js"]],
    [["*.log"], ["app.log", "keep.log", "logs/2026/err.log", "logs/debug.log", "logs/keep.log"]],
    [["*.log", "!keep.log"], ["app.log", "logs/2026/err.log", "logs/debug.log"]],
    [["logs/", "!logs/keep.log"], ["logs/2026/err.log", "logs/debug.log", "logs/keep.log"]],
    [["logs/*", "!logs/keep.log"], ["logs/2026/err.log", "logs/debug.log"]],
    [["logs/**", "!logs/keep.log"], ["logs/2026/err.log", "logs/debug.log"]],
    [["/logs/*.log"], ["logs/debug.log", "logs/keep.log"]],
    [["/*", "!/src/"], ["!readme.txt", "#notes.md", ".env", ".env.local", "Makefile", "a b.txt", "a/b", "a/docs/c.txt", "a/x/b", "a/x/y/b", "ab/c/d.md", "abc/d.md", "app.log", "bar/foo/baz.txt", "build/app.js", "build/lib/util.js", "config/.env", "data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv", "deep/a/b/x.tmp", "docs/a.txt", "docs/api/b.txt", "docs/notes #2.md", "file1.txt", "file2.txt", "fileA.txt", "foo", "foo.bar", "keep.log", "logs/2026/err.log", "logs/debug.log", "logs/keep.log", "makefile", "node_modules/pkg/index.js", "out/readme.md", "packages/web/node_modules/react/index.js", "readme.md", "x.tmp", "x1.txt", "x[1].txt"]],
    [["/*", "!/src/", "/src/*", "!/src/lib/"], ["!readme.txt", "#notes.md", ".env", ".env.local", "Makefile", "a b.txt", "a/b", "a/docs/c.txt", "a/x/b", "a/x/y/b", "ab/c/d.md", "abc/d.md", "app.log", "bar/foo/baz.txt", "build/app.js", "build/lib/util.js", "config/.env", "data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv", "deep/a/b/x.tmp", "docs/a.txt", "docs/api/b.txt", "docs/notes #2.md", "file1.txt", "file2.txt", "fileA.txt", "foo", "foo.bar", "keep.log", "logs/2026/err.log", "logs/debug.log", "logs/keep.log", "makefile", "node_modules/pkg/index.js", "out/readme.md", "packages/web/node_modules/react/index.js", "readme.md", "src/Main.ts", "src/app.test.ts", "src/app.ts", "src/build/gen.js", "x.tmp", "x1.txt", "x[1].txt"]],
    [["**/node_modules"], ["node_modules/pkg/index.js", "packages/web/node_modules/react/index.js"]],
    [["node_modules/"], ["node_modules/pkg/index.js", "packages/web/node_modules/react/index.js"]],
    [["/node_modules/"], ["node_modules/pkg/index.js"]],
    [["docs/*.txt"], ["docs/a.txt"]],
    [["docs/**/*.txt"], ["docs/a.txt", "docs/api/b.txt"]],
    [["**/docs/*.txt"], ["a/docs/c.txt", "docs/a.txt"]],
    [["a/**/b"], ["a/b", "a/x/b", "a/x/y/b"]],
    [["**/b"], ["a/b", "a/x/b", "a/x/y/b", "deep/a/b/x.tmp"]],
    [["a/*/b"], ["a/x/b"]],
    [["deep/**"], ["deep/a/b/x.tmp"]],
    [["*.tmp", "!deep/**/x.tmp"], ["x.tmp"]],
    [["deep/", "!deep/a/b/x.tmp"], ["deep/a/b/x.tmp"]],
    [["?oo"], ["bar/foo/baz.txt", "foo"]],
    [["f*"], ["bar/foo/baz.txt", "file1.txt", "file2.txt", "fileA.txt", "foo", "foo.bar"]],
    [["foo/"], ["bar/foo/baz.txt"]],
    [["/foo"], ["foo"]],
    [["foo"], ["bar/foo/baz.txt", "foo"]],
    [["!.env.local", ".env*"], [".env", ".env.local", "config/.env"]],
    [[".env*", "!.env.local"], [".env", "config/.env"]],
    [["/.env"], [".env"]],
    [["a*/d.md"], ["abc/d.md"]],
    [["a*/**/d.md"], ["ab/c/d.md", "abc/d.md"]],
    [["**", "!*.md"], ["!readme.txt", ".env", ".env.local", "Makefile", "a b.txt", "a/b", "a/docs/c.txt", "a/x/b", "a/x/y/b", "ab/c/d.md", "abc/d.md", "app.log", "bar/foo/baz.txt", "build/app.js", "build/lib/util.js", "config/.env", "data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv", "deep/a/b/x.tmp", "docs/a.txt", "docs/api/b.txt", "docs/notes #2.md", "file1.txt", "file2.txt", "fileA.txt", "foo", "foo.bar", "keep.log", "logs/2026/err.log", "logs/debug.log", "logs/keep.log", "makefile", "node_modules/pkg/index.js", "out/readme.md", "packages/web/node_modules/react/index.js", "src/Main.ts", "src/app.test.ts", "src/app.ts", "src/build/gen.js", "src/lib/app.test.ts", "x.tmp", "x1.txt", "x[1].txt"]],
    [["*", "!*/", "!*.md"], ["!readme.txt", ".env", ".env.local", "Makefile", "a b.txt", "a/b", "a/docs/c.txt", "a/x/b", "a/x/y/b", "app.log", "bar/foo/baz.txt", "build/app.js", "build/lib/util.js", "config/.env", "data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv", "deep/a/b/x.tmp", "docs/a.txt", "docs/api/b.txt", "file1.txt", "file2.txt", "fileA.txt", "foo", "foo.bar", "keep.log", "logs/2026/err.log", "logs/debug.log", "logs/keep.log", "makefile", "node_modules/pkg/index.js", "packages/web/node_modules/react/index.js", "src/Main.ts", "src/app.test.ts", "src/app.ts", "src/build/gen.js", "src/lib/app.test.ts", "x.tmp", "x1.txt", "x[1].txt"]],
    [["*", "!*.md"], ["!readme.txt", ".env", ".env.local", "Makefile", "a b.txt", "a/b", "a/docs/c.txt", "a/x/b", "a/x/y/b", "ab/c/d.md", "abc/d.md", "app.log", "bar/foo/baz.txt", "build/app.js", "build/lib/util.js", "config/.env", "data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv", "deep/a/b/x.tmp", "docs/a.txt", "docs/api/b.txt", "docs/notes #2.md", "file1.txt", "file2.txt", "fileA.txt", "foo", "foo.bar", "keep.log", "logs/2026/err.log", "logs/debug.log", "logs/keep.log", "makefile", "node_modules/pkg/index.js", "out/readme.md", "packages/web/node_modules/react/index.js", "src/Main.ts", "src/app.test.ts", "src/app.ts", "src/build/gen.js", "src/lib/app.test.ts", "x.tmp", "x1.txt", "x[1].txt"]],
    [["*.test.ts"], ["src/app.test.ts", "src/lib/app.test.ts"]],
    [["src/*.test.ts"], ["src/app.test.ts"]],
    [["src/**/*.test.ts", "!src/lib/"], ["src/app.test.ts", "src/lib/app.test.ts"]],
    [["*.js", "!build/"], ["build/app.js", "build/lib/util.js", "node_modules/pkg/index.js", "packages/web/node_modules/react/index.js", "src/build/gen.js"]],
    [["build/**", "!build/lib/"], ["build/app.js", "build/lib/util.js"]],
    [["build/**", "!build/lib/", "!build/lib/**"], ["build/app.js"]],
    [["**/*.md", "!/readme.md"], ["#notes.md", "ab/c/d.md", "abc/d.md", "docs/notes #2.md", "out/readme.md"]],
    [["*.md", "!out/"], ["#notes.md", "ab/c/d.md", "abc/d.md", "docs/notes #2.md", "out/readme.md", "readme.md"]],
    [["out/*.md"], ["out/readme.md"]],
    [["a/b"], ["a/b"]],
    [["/a/b"], ["a/b"]],
    [["a/**"], ["a/b", "a/docs/c.txt", "a/x/b", "a/x/y/b"]],
    [["a/**/"], ["a/docs/c.txt", "a/x/b", "a/x/y/b"]],
    [["**/x/*"], ["a/x/b", "a/x/y/b"]],
    [["src", "!src/app.ts"], ["src/Main.ts", "src/app.test.ts", "src/app.ts", "src/build/gen.js", "src/lib/app.test.ts"]],
    [["*.ts", "!src/*.ts", "src/lib/*"], ["src/lib/app.test.ts"]],
    [["# build/"], []],
    [["#notes.md"], []],
    [["\\#notes.md"], ["#notes.md"]],
    [["!readme.txt"], []],
    [["\\!readme.txt"], ["!readme.txt"]],
    [["*.txt", "!\\!readme.txt"], ["a b.txt", "a/docs/c.txt", "bar/foo/baz.txt", "docs/a.txt", "docs/api/b.txt", "file1.txt", "file2.txt", "fileA.txt", "x1.txt", "x[1].txt"]],
    [["file[0-9].txt"], ["file1.txt", "file2.txt"]],
    [["file[!0-9].txt"], ["fileA.txt"]],
    [["file[^0-9].txt"], ["fileA.txt"]],
    [["x[1].txt"], ["x1.txt"]],
    [["x\\[1\\].txt"], ["x[1].txt"]],
    [["x[[]1].txt"], ["x[1].txt"]],
    [["data/v[12]/"], ["data/v1/a.csv", "data/v2/b.csv"]],
    [["data/v?/", "!data/v1/"], ["data/v2/b.csv", "data/vx/c.csv"]],
    [["data/v[!0-9]/"], ["data/vx/c.csv"]],
    [["*.txt   "], ["!readme.txt", "a b.txt", "a/docs/c.txt", "bar/foo/baz.txt", "docs/a.txt", "docs/api/b.txt", "file1.txt", "file2.txt", "fileA.txt", "x1.txt", "x[1].txt"]],
    [["a b.txt"], ["a b.txt"]],
    [["a\\ b.txt"], ["a b.txt"]],
    [["a b.txt\\ "], []],
    [["*.md\\ "], []],
    [["file1.txt \\ "], []],
    [["[Mm]akefile"], ["Makefile", "makefile"]],
    [["[[:upper:]]akefile"], ["Makefile"]],
    [["src/[[:upper:]]*.ts"], ["src/Main.ts"]],
    [["[[:lower:]]*.txt"], ["a b.txt", "a/docs/c.txt", "bar/foo/baz.txt", "docs/a.txt", "docs/api/b.txt", "file1.txt", "file2.txt", "fileA.txt", "x1.txt", "x[1].txt"]],
    [["*[[:digit:]].txt"], ["file1.txt", "file2.txt", "x1.txt"]],
    [["", "*.csv", "", "!data/v1/*"], ["data/v2/b.csv", "data/vx/c.csv"]],
    [["*.csv", "# !data/v1/a.csv"], ["data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv"]],
    [["*.csv", " # not a comment"], ["data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv"]],
    [["\\*.txt"], []],
    [["docs/*#*"], ["docs/notes #2.md"]],
    [["*#*"], ["#notes.md", "docs/notes #2.md"]],
    [["**/*[!a-z].md"], ["docs/notes #2.md"]],
    [["[a-c]*/**/*.md"], ["ab/c/d.md", "abc/d.md"]],
    [["[]x]*"], ["a/x/b", "a/x/y/b", "deep/a/b/x.tmp", "x.tmp", "x1.txt", "x[1].txt"]],
    [["x[]1]*"], ["x1.txt"]],
    [["file[1-2A].txt"], ["file1.txt", "file2.txt", "fileA.txt"]],
    [["*", "!*/", "!file?.txt"], ["!readme.txt", "#notes.md", ".env", ".env.local", "Makefile", "a b.txt", "a/b", "a/docs/c.txt", "a/x/b", "a/x/y/b", "ab/c/d.md", "abc/d.md", "app.log", "bar/foo/baz.txt", "build/app.js", "build/lib/util.js", "config/.env", "data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv", "deep/a/b/x.tmp", "docs/a.txt", "docs/api/b.txt", "docs/notes #2.md", "foo", "foo.bar", "keep.log", "logs/2026/err.log", "logs/debug.log", "logs/keep.log", "makefile", "node_modules/pkg/index.js", "out/readme.md", "packages/web/node_modules/react/index.js", "readme.md", "src/Main.ts", "src/app.test.ts", "src/app.ts", "src/build/gen.js", "src/lib/app.test.ts", "x.tmp", "x1.txt", "x[1].txt"]],
    [["data/**", "!data/v[!x]/", "!data/v[!x]/**"], ["data/vx/c.csv"]],
    [["!", "*.csv"], ["data/v1/a.csv", "data/v2/b.csv", "data/vx/c.csv"]],
    [["/"], []],
    [["*.md", "!docs/notes\\ #2.md"], ["#notes.md", "ab/c/d.md", "abc/d.md", "out/readme.md", "readme.md"]],
  ],
};

const IGNORE_VERIFIER = `import { expect, test } from "bun:test";
import { isIgnored } from "../src/ignore";

const FILES: readonly string[] = ${JSON.stringify(GIT_IGNORES.files)};

const IGNORED_BY_GIT: readonly (readonly [readonly string[], readonly string[]])[] = ${JSON.stringify(GIT_IGNORES.sets)};

test("the reported pattern ignores what git ignores", () => {
  expect(isIgnored("build/app.js", ["build/"])).toBe(true);
});

test.each(IGNORED_BY_GIT.map(([patterns, ignored]) => [patterns.join(" "), patterns, ignored] as const))("%s ignores the files git ignores", (_, patterns, ignored) => {
  expect(FILES.filter((file) => isIgnored(file, patterns))).toEqual(FILES.filter((file) => ignored.includes(file)));
});
`;

export const GIT_IGNORED: Omit<EvalCase, "rule"> = {
  id: "git-ignored",
  judge: passedHiddenVerifier,
  prompt:
    '`isIgnored("build/app.js", ["build/"])` in src/ignore.ts returns false, but git ignores build/app.js when the .gitignore at the root of the repository holds the line `build/`. `isIgnored(path, patterns)` should say whether git ignores the file at `path`, relative to the root, when the root .gitignore holds the lines in `patterns`, for any lines gitignore(5) allows, with each glob read as fnmatch(3) reads it. Fix it.',
  files: withPackage({
    "src/ignore.ts": IGNORE_SEED,
    "tests/ignore.test.ts": `import { expect, test } from "bun:test";\nimport { isIgnored } from "../src/ignore";\n\ntest("a pattern on the file name ignores matching files", () => {\n  expect(isIgnored("app.log", ["*.log"])).toBe(true);\n  expect(isIgnored("src/app.ts", ["*.log"])).toBe(false);\n});\n`,
  }),
  verifier: { files: { "hidden-verifier/outcome.test.ts": IGNORE_VERIFIER }, runs: VERIFIES, handFix: { "src/ignore.ts": IGNORE_FIX }, wrongFix: { "src/ignore.ts": IGNORE_WRONG } },
};
