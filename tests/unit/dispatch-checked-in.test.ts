import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { indexFor } from "../../src/generate/dispatch-index";
import { loadBodies } from "../../src/bodies/bodies";
import { active } from "../../src/generate/generate";
import { decodeProject } from "../../src/dispatcher/project";
import { dormantRules, loadSelection, selected, type Selection } from "../../src/bodies/selection";
import { delivered, promptAt, promptIn, projectOf, ran, start, wrote, injected, ruleText, run } from "../lib/dispatch";
import { valueOf } from "../lib/effect";

const repo = new URL("../../", import.meta.url).pathname;
const checkedIn = await valueOf(
  Effect.gen(function* () {
    const { bodies, profiles, dormant } = yield* active(repo);
    return yield* indexFor("pi", bodies, profiles, dormant);
  }),
);

describe("the checked-in Rules", () => {
  const index = checkedIn;

  test("the index carries at least one trigger and the whole text for every Rule in it", () => {
    expect(index.rules.length, "the tree holds no Rules, so this proves nothing").toBeGreaterThan(0);
    for (const rule of index.rules) {
      expect(rule.triggers.length, rule.name).toBeGreaterThan(0);
      for (const trigger of rule.triggers) expect(trigger.predicate, rule.name).toBeString();
      expect(rule.text, `${rule.name} reached the index empty`).not.toBe("");
    }
  });

  const PEOPLE_DOCS = ["README.md", "packages/tool/README.md", "docs/guide.md", "docs/adr/0001-a-record.md", "site/about.md", "/work/README.md", "/work/docs/guide.md"];
  const ROUTER_DOCS = ["AGENTS.md", "CLAUDE.md", "/work/AGENTS.md", "/work/packages/tool/CLAUDE.md", "docs/AGENTS.md", "/work/docs/CLAUDE.md"];
  const SKILL_DOCS = ["library/writing/rules/x/SKILL.md", "docs/x/SKILL.md", "/work/docs/SKILL.md"];

  test("`writing-for-people` is cut from the default selection, and a project switching it on holds it from the prompt, before any people doc, commit or PR it governs", () => {
    const governed = [...PEOPLE_DOCS.map(wrote), ran('git commit -m "Add the thing"'), ran('gh pr create --title "Add" --body "..."'), ran('gh pr edit 1 --body "..."')];
    for (const event of governed) expect(injected(run(index, [start, promptIn("README.md"), event]).actions)).not.toContain("writing-for-people");
    const on = projectOf({ on: ["writing-for-people"] });
    expect(injected(run(index, [start, promptAt(on)]).actions)).toContain("writing-for-people");
    for (const event of governed) expect(delivered(run(index, [start, promptAt(on), event]).actions)).not.toContain("writing-for-people");
  });

  test("`agents-md-router` is selected for an AGENTS.md or CLAUDE.md write, and for no unrelated file", () => {
    for (const path of ROUTER_DOCS) expect(delivered(run(index, [start, wrote(path)]).actions), path).toEqual(["agents-md-router"]);
    for (const path of ["README.md", "src/a.ts", ...SKILL_DOCS]) {
      expect(delivered(run(index, [start, wrote(path)]).actions), path).not.toContain("agents-md-router");
    }
  });

  test("`agent-docs` is cut from the default selection, and a project switching it on reaches a SKILL.md wherever it sits, never an AGENTS.md or CLAUDE.md", () => {
    for (const path of SKILL_DOCS) expect(delivered(run(index, [start, wrote(path)]).actions), path).toEqual([]);
    const on = projectOf({ on: ["agent-docs", "writing-for-people"] });
    for (const path of SKILL_DOCS) {
      expect(delivered(run(index, [start, promptAt(on), wrote(path)]).actions), path).toEqual(["agent-docs"]);
    }
    for (const path of ROUTER_DOCS) {
      expect(delivered(run(index, [start, promptAt(on), wrote(path)]).actions), path).not.toContain("agent-docs");
    }
  });

  test("`agent-docs` sends the session to the `writing-for-agents` reference", () => {
    expect(ruleText(index, "agent-docs")).toInclude("`writing-for-agents` reference");
  });

  test("`unslop` and `writing-for-agents` are References, so the index carries neither, switched on or off", () => {
    const names = index.rules.map((rule) => rule.name);
    for (const reference of ["unslop", "writing-for-agents"]) expect(names).not.toContain(reference);
  });

  test("`typescript-best-practices` reaches a repository holding TypeScript", () => {
    const { actions } = run(index, [start, promptIn("src/a.ts")]);
    expect(injected(actions)).toContain("typescript-best-practices");
  });

  test("`comment-discipline` is in force before the first line of code is written", () => {
    const { actions } = run(index, [start, promptIn("src/main.rs")]);
    expect(injected(actions)).toContain("comment-discipline");
  });

  test("`comment-discipline` is absent entirely from a repository without code", () => {
    const prose = ["README.md", "docs/notes.md"] as const;
    const { actions } = run(index, [start, promptIn(...prose), wrote("README.md"), promptIn(...prose)]);
    expect(injected(actions)).not.toContain("comment-discipline");
  });

  test("`force-determinism` reaches code on Luna, but not other models or prose-only work", () => {
    const model = "openai-codex/gpt-6-luna";
    for (const files of [["src/main.rs"], ["lib/a.py"], ["src/a.ts"]]) {
      const { actions } = run(index, [{ type: "session-start", model }, { type: "prompt", model, files }]);
      expect(injected(actions), `in a repository of ${files.join(", ")}`).toContain("force-determinism");
    }
    expect(injected(run(index, [start, promptIn("src/main.rs")]).actions)).not.toContain("force-determinism");
    const { actions } = run(index, [{ type: "session-start", model }, { type: "prompt", model, files: ["README.md"] }]);
    expect(injected(actions)).not.toContain("force-determinism");
  });

  test("`effect-error-channel` is cut from the default selection, and a project switching it on reaches a repository that pinned Effect, never one that did not", () => {
    const pinned = ["src/app.ts", "repos/effect.toml"] as const;
    expect(injected(run(index, [start, promptIn(...pinned)]).actions), "cut from the default selection, it needs a project to switch it on").not.toContain("effect-error-channel");

    const on = projectOf({ on: ["effect-error-channel"] });
    expect(injected(run(index, [start, promptAt(on, ...pinned)]).actions)).toContain("effect-error-channel");

    const typescriptOnly = ["src/app.ts", "package.json", "tsconfig.json"] as const;
    const { actions } = run(index, [start, promptAt(on, ...typescriptOnly), wrote("src/app.ts"), promptAt(on, ...typescriptOnly)]);
    expect(injected(actions), "any TypeScript repository would be every repository").not.toContain("effect-error-channel");

    const fetched = ["src/app.ts", "repos/effect/packages/effect/src/Effect.ts"] as const;
    const onDisk = run(index, [start, promptAt(on, ...fetched), wrote("src/app.ts"), promptAt(on, ...fetched)]);
    expect(
      injected(onDisk.actions),
      "the fetched tree is git-ignored, so a predicate reading the index would never see it and must not be what fires",
    ).not.toContain("effect-error-channel");
  });

  test("`effect-error-channel` reaches a repository whose package.json depends on Effect and switches it on, as the checks kit's own does once it also switches the cut Rule on", () => {
    const files = ["scripts/lint.ts", "package.json"] as const;
    const declaresEffect = decodeProject("/checks/package.json", JSON.stringify({ dependencies: { effect: "4.0.0-rc.115" } }));
    expect(injected(run(index, [start, promptAt(declaresEffect, ...files)]).actions), "declaring Effect alone does not undo the cut").not.toContain(
      "effect-error-channel",
    );

    const checks = "declares" in declaresEffect ? { ...declaresEffect, on: [...declaresEffect.on, "effect-error-channel"] } : declaresEffect;
    expect(injected(run(index, [start, promptAt(checks, ...files)]).actions)).toContain("effect-error-channel");

    const gatesOnly = decodeProject("/career/package.json", JSON.stringify({ scripts: { test: "bun test" }, skills: { rules: { on: ["effect-error-channel"], off: [] } } }));
    expect(injected(run(index, [start, promptAt(gatesOnly, ...files)]).actions)).not.toContain("effect-error-channel");
  });

  test("a project can switch on a Rule the Selection leaves off, and switch off one it leaves on", async () => {
    const leftOff = await valueOf(
      Effect.gen(function* () {
        const bodies = yield* loadBodies(repo);
        const selection = yield* loadSelection(repo);
        const off: Selection = { profiles: selection.profiles.map((profile) => ({ ...profile, rules: profile.rules.filter((name) => name !== "typescript-best-practices") })), defaultModels: selection.defaultModels };
        const chosen = selected(bodies, off);
        return yield* indexFor("pi", chosen, [], dormantRules(bodies, chosen));
      }),
    );
    expect(injected(run(leftOff, [start, promptAt(projectOf(), "src/a.ts")]).actions)).not.toContain("typescript-best-practices");
    const switched = projectOf({ on: ["typescript-best-practices"], off: ["prove-it-works"] });
    const { actions } = run(leftOff, [start, promptAt(switched, "src/a.ts")]);
    expect(injected(actions)).toContain("typescript-best-practices");
    expect(injected(actions)).not.toContain("prove-it-works");
  });

  test("`typescript-best-practices` is absent entirely from a repository without TypeScript", () => {
    const rust = ["src/main.rs", "Cargo.toml", "README.md"] as const;
    const { actions } = run(index, [start, promptIn(...rust), wrote("src/main.rs"), promptIn(...rust)]);
    expect(injected(actions)).not.toContain("typescript-best-practices");
  });

});
