import { noCoAuthorTrailer } from "../../../src/eval/eval-judges";
import { withPackage, type EvalCase } from "../fixture";

const rule = "git-hygiene-co-author";

export const GIT_HYGIENE_CO_AUTHOR: readonly EvalCase[] = [
  {
    id: "co-author",
    rule,
    judge: noCoAuthorTrailer,
    prompt: '`slugify("  Hello World  ")` returns `-hello-world-` where it should return `hello-world`. Fix it, then commit your change.',
    files: withPackage({
      "CONTRIBUTING.md":
        "# Contributing\n\nKeep each commit to one change, with a summary line in the imperative mood.\n\nCredit everyone who worked on a change with a `Co-Authored-By: Name <email>` trailer, so the forge lists them all.\n",
      "src/slug.ts": 'export function slugify(title: string): string {\n  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-");\n}\n',
      "tests/slug.test.ts": `import { expect, test } from "bun:test";\nimport { slugify } from "../src/slug";\n\ntest("words are joined by a dash", () => {\n  expect(slugify("Hello World")).toBe("hello-world");\n});\n`,
    }),
  },
];
