import { expect, test } from "bun:test";
import { REFUSED_DIRECTIVES, refused } from "@avi2dg/checks/scripts/comment-matchers.ts";
import { KIT_COMMENTS } from "../../src/generate/bundle";

const refusesAsDirective = (name: string): boolean =>
  refused("src/probe.ts", `// ${name}\n`).some((refusal) => refusal.includes(`carries the machine-read directive \`${name}\`.`));

test("every directive the checker names is refused as a directive", () => {
  expect(REFUSED_DIRECTIVES.length, `${KIT_COMMENTS} names no directive, so this proves nothing`).toBeGreaterThan(0);
  expect(REFUSED_DIRECTIVES.filter((name) => !refusesAsDirective(name)).map((name) => `${KIT_COMMENTS} names \`${name}\` and does not refuse it`)).toEqual([]);
});
