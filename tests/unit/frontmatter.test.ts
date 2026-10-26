import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KINDS, LIBRARY, LOCAL, parseFrontmatter, type Body, type Harness, type Kind } from "../../src/bodies/bodies";
import { active } from "../../src/generate/generate";
import { consultable, hub } from "../../src/generate/hub";
import { indexFor } from "../../src/generate/dispatch-index";
import { MalformedBody } from "../../src/platform/failures";
import { SELECTION_PATH } from "../../src/bodies/selection";
import type { ScopeCondition } from "../../src/dispatcher/scope-condition";
import { failure, said, saidBy, value } from "../lib/effect";
import { bodyOf, declared, dirFor, frontmatterOf, rule } from "../lib/frontmatter";

const repo = new URL("../../", import.meta.url).pathname;

const pi: Harness = "pi";
const A_RULE = dirFor("rule", "a-rule");

describe("frontmatter", () => {
  test("the required fields are accepted, and an omitted `harnesses` means all", () => {
    const parsed = value(parseFrontmatter(A_RULE, frontmatterOf(rule)));
    expect(parsed.name).toBe("a-rule");
    expect(parsed.kind).toBe("rule");
    expect(parsed.source).toBe(LOCAL);
    expect(parsed.harnesses, "an omitted `harnesses` invented a list").toBeUndefined();
  });

  for (const field of ["name", "description", "kind", "source"]) {
    test(`a Body missing \`${field}\` aborts, naming the Body and the field`, () => {
      const { [field]: _, ...without } = rule as Record<string, string>;
      expect(said(parseFrontmatter(A_RULE, frontmatterOf(without)))).toMatch(
        new RegExp(`rules/a-rule.*\\b${field}\\b`),
      );
    });
  }

  test("a field the schema does not know aborts, naming it", () => {
    expect(said(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, harneses: "[pi]" })))).toMatch(
      /rules\/a-rule.*harneses/,
    );
  });

  test("a Body whose `kind` disagrees with its directory aborts, naming both", () => {
    expect(said(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, kind: "skill" })))).toMatch(
      /rules\/a-rule.*kind.*skill.*rule/,
    );
  });

  test("a Body whose `name` is not its directory aborts", () => {
    expect(said(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, name: "another-rule" })))).toMatch(
      /rules\/a-rule.*name.*another-rule/,
    );
  });

  test("provenance is either an origin commit or the word for `written here`", () => {
    for (const source of ["https://github.com/mattpocock/skills@885e2ca4d842d139e9aef4e48d366c63cb1b8013", LOCAL]) {
        expect(() => value(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, source })))).not.toThrow();
    }
    expect(said(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, source: "https://github.com/x/y" })))).toMatch(
      /rules\/a-rule.*source/,
    );
  });

  test("`harnesses` accepts the harnesses in scope and refuses anything else", () => {
    const parsed = value(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, harnesses: "[pi, codex]" })));
    expect(parsed.harnesses).toEqual(["pi", "codex"]);
    expect(said(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, harnesses: "[emacs]" })))).toMatch(
      /rules\/a-rule.*harnesses.*emacs/,
    );
    expect(said(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, harnesses: "[pi, emacs]" })))).toMatch(
      /harnesses` names "emacs"/,
    );
    expect(said(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, harnesses: "[]" })))).toMatch(
      /rules\/a-rule.*harnesses/,
    );
  });

  const kindOnly: Record<"trigger" | "forbid" | "consults", { kinds: Kind[]; sample: string }> = {
    trigger: { kinds: ["rule"], sample: "{ predicate: always }" },
    forbid: { kinds: ["rule"], sample: "comments" },
    consults: { kinds: ["rule", "skill", "reference"], sample: "[code-smells]" },
  };
  const alongside: Record<string, Record<string, string>> = {
    rule: { trigger: kindOnly.trigger.sample },
  };

  test("`consults` names the Bodies a Body pulls by name, and refuses a list of anything else", () => {
    const pulling = (consults: string) => ({ ...declared, name: "a-body", kind: "skill", consults });
    const parsed = value(parseFrontmatter(dirFor("skill", "a-body"), frontmatterOf(pulling("[code-smells, how]"))));
    expect(parsed.kind === "skill" && parsed.consults).toEqual(["code-smells", "how"]);
    for (const bad of ["[]", "code-smells", "[references/code-smells]", "[Code-Smells]"]) {
      expect(said(parseFrontmatter(dirFor("skill", "a-body"), frontmatterOf(pulling(bad)))), bad).toMatch(
        /skills\/a-body.*consults/,
      );
    }
  });

  test("`disable-model-invocation` aborts, because it would hide a Body from the by-name lookup", () => {
    expect(
      said(
        parseFrontmatter(dirFor("reference", "a-body"), frontmatterOf({ ...declared, name: "a-body", kind: "reference", "disable-model-invocation": "true" })),
      ),
    ).toMatch(/references\/a-body.*disable-model-invocation/);
  });

  test("`forbid` names what a Rule refuses at every write, and refuses a name no Dispatcher can match", () => {
    for (const forbid of ["comments", "prose"] as const) {
      const parsed = value(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, forbid })));
      expect(parsed.kind === "rule" && parsed.forbid).toBe(forbid);
    }
    for (const bad of ["directives", "[comments]", '""']) {
      expect(said(parseFrontmatter(A_RULE, frontmatterOf({ ...rule, forbid: bad }))), bad).toMatch(
        /rules\/a-rule.*`forbid`.*can refuse only comments, prose/,
      );
    }
  });

  for (const [field, { kinds, sample }] of Object.entries(kindOnly)) {
    test(`\`${field}\` on a Body that is not a ${kinds.join(" or a ")} aborts, naming the field`, () => {
      for (const other of KINDS.filter((k) => !kinds.includes(k))) {
        const wrong = dirFor(other, "a-body");
        const fields = { ...declared, ...alongside[other], name: "a-body", kind: other, [field]: sample };
        expect(said(parseFrontmatter(wrong, frontmatterOf(fields))), `${field} on a ${other}`).toMatch(
          new RegExp(`${wrong}.*\\b${field}\\b`),
        );
      }
    });
  }
});

const reference = bodyOf({ ...declared, name: "code-smells", kind: "reference" }, "The baseline.");
const reader = bodyOf(
  { ...declared, name: "reviewer", kind: "skill", consults: "[code-smells]" },
  "Load `code-smells` and hold every hunk against it.",
);

describe("a malformed frontmatter fence", () => {
  const malformed = [
    { how: "never opens", text: "# Body\n", message: "does not open with a --- frontmatter fence" },
    { how: "never closes", text: "---\nname: a-rule\n\n# Body\n", message: "opens a --- frontmatter fence and never closes it" },
  ];

  for (const { how, text, message } of malformed) {
    const holding = (body: Body): Body => ({ ...body, skill: text });
    const failures: Record<string, { dir: string; failed: () => unknown }> = {
      "parsing it": { dir: A_RULE, failed: () => failure(parseFrontmatter(A_RULE, text)) },
      "indexing a Rule": {
        dir: A_RULE,
        failed: () => failure(indexFor(pi, [holding(bodyOf({ ...rule, kind: "rule" }))])),
      },
      "checking a Body's consults": {
        dir: dirFor("skill", "reviewer"),
        failed: () => failure(consultable([reference, holding(reader)])),
      },
    };
    for (const [what, { dir, failed }] of Object.entries(failures)) {
      test(`one that ${how} fails ${what} as a MalformedBody naming the Body, not as a defect`, () => {
        const found = failed();
        expect(found).toBeInstanceOf(MalformedBody);
        expect(found).toHaveProperty("message", `${dir}: ${message}`);
      });
    }
  }
});

describe("a Body consulted by name", () => {
  test("a Reference is reached by name from inside another Body", () => {
    expect(() => value(consultable([reference, reader]))).not.toThrow();
    expect(value(hub([reference, reader])).get("code-smells")).toBe(dirFor("reference", "code-smells"));
  });

  test("a Rule may consult one too, since a Rule is prose a model reads", () => {
    const ruling = bodyOf(
      { ...declared, name: "a-rule", kind: "rule", trigger: "{ predicate: always }", consults: "[code-smells]" },
      "Pull `code-smells` when judging a diff.",
    );
    expect(() => value(consultable([reference, ruling]))).not.toThrow();
  });

  test("an unknown Body aborts, naming the Body and the field", () => {
    const typo = bodyOf(
      { ...declared, name: "reviewer", kind: "skill", consults: "[code-smelz]" },
      "Load `code-smelz`.",
    );
    expect(said(consultable([reference, typo]))).toMatch(/skills\/reviewer.*consults.*code-smelz/);
  });

  test("consulting a Rule aborts, because a Rule is not reached by name", () => {
    const ruling = bodyOf({ ...declared, name: "unslop", kind: "rule", trigger: "{ predicate: always }" });
    const pulling = bodyOf({ ...declared, name: "reviewer", kind: "skill", consults: "[unslop]" }, "Pull `unslop`.");
    expect(said(consultable([ruling, pulling]))).toMatch(/skills\/reviewer.*consults.*rules\/unslop/);
  });

  test("a Body that declares a link its own words never mention aborts", () => {
    const silent = bodyOf({ ...declared, name: "reviewer", kind: "skill", consults: "[code-smells]" }, "Review it.");
    expect(said(consultable([reference, silent]))).toMatch(/skills\/reviewer.*consults.*code-smells/);
  });

  test("the mention has to be the name in backticks, not the word in a sentence", () => {
    const named = bodyOf({ ...declared, name: "how", kind: "reference" }, "The walkthrough.");
    const loose = bodyOf(
      { ...declared, name: "reviewer", kind: "skill", consults: "[how]" },
      "Work out how the thing works before judging it.",
    );
    expect(said(consultable([named, loose]))).toMatch(/skills\/reviewer.*consults.*how/);
  });

  test("a consulted Body a harness does not receive aborts, naming that harness", () => {
    const elsewhere: Body = { ...reference, harnesses: ["codex"] };
    expect(said(consultable([elsewhere, reader]))).toMatch(/skills\/reviewer.*code-smells.*pi and claude-code/);
  });

  test("a consulted Body the Selection left out aborts, because the Hub would not offer it", () => {
    expect(said(hub([reader]))).toMatch(/skills\/reviewer.*code-smells.*the Hub does not offer/);
  });

  test("in the real tree, gating a consulted Reference to codex aborts the build naming pi and claude-code, not a missing Hub entry", async () => {
    const tmp = `${mkdtempSync(join(tmpdir(), "skills-consults-"))}/`;
    try {
      for (const dir of [LIBRARY, SELECTION_PATH]) cpSync(`${repo}${dir}`, `${tmp}${dir}`, { recursive: true });
      const planted = `${tmp}${LIBRARY}/engineering/references/effect-patterns/SKILL.md`;
      writeFileSync(planted, readFileSync(planted, "utf8").replace("kind: reference\n", "kind: reference\nharnesses: [codex]\n"));
      const message = await saidBy(active(tmp));
      expect(message).toMatch(/rules\/effect-error-channel.*consults.*effect-patterns.*pi and claude-code does not receive/);
      expect(message).not.toMatch(/does not offer/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("a Rule's trigger", () => {
  const triggered = (trigger: string) => frontmatterOf({ ...rule, trigger });
  const parse = (trigger: string) => parseFrontmatter(A_RULE, triggered(trigger));

  test("a Rule with no trigger aborts, because it could never fire", () => {
    const { trigger: _, ...without } = rule;
    expect(said(parseFrontmatter(A_RULE, frontmatterOf(without)))).toMatch(/rules\/a-rule.*trigger.*missing/);
  });

  test("each of the four predicates parses with its parameters", () => {
    const shapes: Record<string, ScopeCondition> = {
      "{ predicate: always }": { predicate: "always" },
      '{ predicate: repo-contains, glob: "**/*.ts" }': { predicate: "repo-contains", glob: "**/*.ts" },
      '{ predicate: file-matches, glob: "**/*.ts" }': { predicate: "file-matches", glob: "**/*.ts" },
      '{ predicate: tool-call, tool: write, argument: path, matches: "**/CHANGELOG.md" }': {
        predicate: "tool-call",
        tool: "write",
        argument: "path",
        matches: "**/CHANGELOG.md",
      },
    };
    for (const [yaml, trigger] of Object.entries(shapes)) {
      expect(value(parse(yaml)), yaml).toMatchObject({ trigger: [trigger] });
    }
  });

  test("a list of predicates parses whole, in declared order", () => {
    const parsed = value(parse('[{ predicate: always }, { predicate: file-matches, glob: "**/*.md" }]'));
    expect(parsed).toMatchObject({
      trigger: [{ predicate: "always" }, { predicate: "file-matches", glob: "**/*.md" }],
    });
  });

  test("an empty list aborts, because such a Rule could never fire", () => {
    expect(said(parse("[]"))).toMatch(/rules\/a-rule.*trigger.*empty list.*never fire/);
  });

  test("a malformed entry is named by its place in the list", () => {
    expect(said(parse('[{ predicate: always }, { predicate: file-matches }]'))).toMatch(
      /rules\/a-rule.*trigger\[1\]\.glob.*missing/,
    );
  });

  test("a predicate that is not one of the four aborts, naming it and listing them", () => {
    expect(said(parse("{ predicate: repo-contins, glob: x }"))).toMatch(
      /rules\/a-rule.*trigger\.predicate.*repo-contins.*always.*repo-contains.*file-matches.*tool-call/,
    );
  });

  test("a trigger that is not a block of fields aborts", () => {
    expect(said(parse("always"))).toMatch(/rules\/a-rule.*trigger/);
  });

  for (const [predicate, missing, yaml] of [
    ["repo-contains", "glob", "{ predicate: repo-contains }"],
    ["file-matches", "glob", "{ predicate: file-matches }"],
    ["tool-call", "tool", "{ predicate: tool-call, argument: path, matches: x }"],
    ["tool-call", "argument", "{ predicate: tool-call, tool: write, matches: x }"],
    ["tool-call", "matches", "{ predicate: tool-call, tool: write, argument: path }"],
  ] as const) {
    test(`a ${predicate} trigger missing \`${missing}\` aborts, naming it`, () => {
      expect(said(parse(yaml))).toMatch(new RegExp(`rules/a-rule.*trigger\\.${missing}.*missing`));
    });
  }

  test("a parameter that does not belong to the predicate aborts, naming both", () => {
    expect(said(parse('{ predicate: repo-contains, glob: "**/*.ts", tool: write }'))).toMatch(
      /rules\/a-rule.*trigger\.tool.*repo-contains/,
    );
    expect(said(parse('{ predicate: always, glob: "**/*.ts" }'))).toMatch(/rules\/a-rule.*trigger\.glob.*always/);
  });

  test("a malformed glob aborts while generating rather than matching nothing forever", () => {
    expect(said(parse('{ predicate: repo-contains, glob: "**/*.{ts,tsx" }'))).toMatch(
      /rules\/a-rule.*trigger\.glob.*malformed/,
    );
  });
});

