import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatch, type Action, type Event, type Index } from "../../src/dispatcher/dispatch";
import { logLine } from "../../src/dispatcher/dispatch-log";
import { KIND_DIRS, LIBRARY, SKILL_FILE, loadBodies } from "../../src/bodies/bodies";
import type { Project } from "../../src/dispatcher/project";
import { PREDICATES, type Predicate, type ScopeCondition } from "../../src/dispatcher/scope-condition";
import {
  always,
  compaction,
  delivered,
  onPush,
  onWrite,
  prompt,
  promptAt,
  promptIn,
  projectOf,
  QUALITY,
  ran,
  ruled,
  start,
  typescript,
  wrote,
  injected,
  nth,
  roundTripped,
  ruleText,
  run,
} from "../lib/dispatch";
import { valueOf } from "../lib/effect";

describe("loadBodies order", () => {
  const ruleFile = (name: string): string =>
    `---\nname: ${name}\ndescription: Fixture body.\nkind: rule\nsource: local\ntrigger:\n  predicate: always\n---\n\n# ${name}\n`;
  const referenceFile = (name: string): string =>
    `---\nname: ${name}\ndescription: Fixture body.\nkind: reference\nsource: local\n---\n\n# ${name}\n`;

  test("bodies come back grouped by kind and sorted by name, whatever order the tree lists them", async () => {
    const tmp = `${mkdtempSync(join(tmpdir(), "skills-order-"))}/`;
    try {
      // Created out of order and across domains, so neither the listing order nor the domain order can rescue a broken sort.
      for (const [domain, name] of [["b-domain", "zeta"], ["c-domain", "alpha"], ["a-domain", "mike"]] as const) {
        mkdirSync(`${tmp}${LIBRARY}/${domain}/${KIND_DIRS.rule}/${name}`, { recursive: true });
        await Bun.write(`${tmp}${LIBRARY}/${domain}/${KIND_DIRS.rule}/${name}/${SKILL_FILE}`, ruleFile(name));
      }
      for (const [domain, name] of [["a-domain", "zed"], ["b-domain", "amy"]] as const) {
        mkdirSync(`${tmp}${LIBRARY}/${domain}/${KIND_DIRS.reference}/${name}`, { recursive: true });
        await Bun.write(`${tmp}${LIBRARY}/${domain}/${KIND_DIRS.reference}/${name}/${SKILL_FILE}`, referenceFile(name));
      }
      const bodies = await valueOf(loadBodies(tmp));
      expect(bodies.map((body) => `${body.kind}/${body.name}`)).toEqual([
        "rule/alpha",
        "rule/mike",
        "rule/zeta",
        "reference/amy",
        "reference/zed",
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("always", () => {
  const index = ruled([["unslop", always]]);

  test("it injects at the first prompt of a session", () => {
    expect(injected(run(index, [prompt]).actions)).toEqual(["unslop"]);
  });

  test("it injects with no session start needed, because every session has one", () => {
    expect(injected(run(index, [start, promptIn("README.md")]).actions)).toEqual(["unslop"]);
  });

  test("it does not inject on an event that is not a prompt", () => {
    expect(injected(run(index, [start, wrote("a.ts"), ran("ls")]).actions)).toEqual([]);
  });
});

describe("a Rule named after a member every object inherits", () => {
  test("it injects at the first prompt", () => {
    expect(injected(run(ruled([["constructor", always]]), [prompt]).actions)).toEqual(["constructor"]);
  });

  test("it delivers on the tool call that matches it", () => {
    expect(delivered(run(ruled([["constructor", onPush]]), [ran("git push")]).actions)).toEqual(["constructor"]);
  });
});

describe("repo-contains", () => {
  const index = ruled([["typescript-best-practices", typescript]]);

  test("a repository holding a match injects it at the first prompt", () => {
    expect(injected(run(index, [start, promptIn("src/a.ts")]).actions)).toEqual(["typescript-best-practices"]);
  });

  test("a file at the root counts, not just one in a directory", () => {
    expect(injected(run(index, [start, promptIn("a.ts")]).actions)).toEqual(["typescript-best-practices"]);
  });

  test("a repository holding no match stays out of context entirely", () => {
    const { actions } = run(index, [start, promptIn("main.rs", "Cargo.toml"), promptIn("main.rs", "Cargo.toml")]);
    expect(actions).toEqual([]);
  });

  test("it is asked from the repository the prompt is standing in", () => {
    expect(injected(run(index, [promptIn("main.rs"), promptIn("src/a.ts")]).actions)).toEqual([
      "typescript-best-practices",
    ]);
  });

  test("a prompt the harness could say nothing about does not fire it", () => {
    expect(run(index, [start, prompt, prompt]).actions).toEqual([]);
  });

  test("it says which file matched, so a Rule firing is never a mystery", () => {
    const action = nth(run(index, [promptIn("src/a.ts")]).actions, 0);
    expect(logLine(action)).toBe("inject typescript-best-practices: repo-contains matched src/a.ts");
  });
});

const unreadable: Project = { path: QUALITY, unreadable: "is not JSON: Unexpected end of JSON input" };

const lines = (actions: readonly Action[]) => actions.map(logLine);

describe("declares", () => {
  const effect: ScopeCondition = { predicate: "declares", key: "effect" };
  const index = ruled([["effect-error-channel", effect]]);

  test("a repository whose package.json makes the declaration injects it at the first prompt, saying which", () => {
    const { actions } = run(index, [start, promptAt(projectOf({ declares: ["effect"] }))]);
    expect(lines(actions)).toEqual(["inject effect-error-channel: declares matched effect"]);
  });

  test("a repository declaring nothing, or holding no package.json, stays out of context", () => {
    expect(run(index, [start, promptAt(projectOf())]).actions).toEqual([]);
    expect(run(index, [start, promptIn("src/a.ts")]).actions).toEqual([]);
  });

  test("it is asked of the repository the prompt is standing in", () => {
    const { actions } = run(index, [start, promptIn("src/a.ts"), promptAt(projectOf({ declares: ["effect"] }))]);
    expect(injected(actions)).toEqual(["effect-error-channel"]);
  });

  test("a package.json that cannot be read fires nothing, and says so once a session rather than at every prompt", () => {
    const { actions } = run(index, [start, promptAt(unreadable), promptAt(unreadable), start, promptAt(unreadable)]);
    const said = `broken dispatcher: ${QUALITY} is not JSON: Unexpected end of JSON input, so no Rule fires on what it declares and none of its switches apply`;
    expect(lines(actions)).toEqual([said, said]);
  });

  test("a Rule already carried is not injected again when the repository comes to declare it", () => {
    const both = ruled([["effect-error-channel", [effect, { predicate: "repo-contains", glob: "repos/effect.toml" }]]]);
    const { actions } = run(both, [start, promptIn("repos/effect.toml"), promptAt(projectOf({ declares: ["effect"] }), "repos/effect.toml")]);
    expect(lines(actions)).toEqual(["inject effect-error-channel: repo-contains matched repos/effect.toml"]);
  });
});

describe("a project's switches", () => {
  const dormant = (index: Index): Index => ({ ...index, rules: index.rules.map((rule) => ({ ...rule, inactive: true as const })) });
  const asleep = dormant(ruled([["asleep", always]])).rules;
  const unslopAndAsleep: Index = { ...ruled([["unslop", always]]), rules: [...ruled([["unslop", always]]).rules, ...asleep] };

  test("a Rule switched off is not injected, whatever would have fired it, and the log says who switched it", () => {
    const index = ruled([["unslop", always], ["typescript-best-practices", typescript]]);
    const off = projectOf({ off: ["unslop", "typescript-best-practices"] });
    const { actions } = run(index, [start, promptAt(off, "src/a.ts")]);
    expect(injected(actions)).toEqual([]);
    expect(lines(actions)).toEqual([
      `switched unslop off: ${QUALITY} switches it off`,
      `switched typescript-best-practices off: ${QUALITY} switches it off`,
    ]);
  });

  test("a Rule switched off is not delivered mid-turn either", () => {
    const index = ruled([["typescript-best-practices", onWrite], ["push-with-care", onPush]]);
    const off = projectOf({ off: ["typescript-best-practices", "push-with-care"] });
    expect(delivered(run(index, [start, promptAt(off), wrote("src/a.ts"), ran("git push")]).actions)).toEqual([]);
    expect(delivered(run(index, [start, promptAt(projectOf()), wrote("src/a.ts"), ran("git push")]).actions)).toEqual([
      "typescript-best-practices",
      "push-with-care",
    ]);
  });

  test("a Rule the Selection leaves off fires nowhere until a project switches it on, and then on its own trigger", () => {
    const index = dormant(ruled([["unslop", always], ["technical-writing", onPush]]));
    expect(run(index, [start, promptAt(projectOf()), ran("git push"), prompt]).actions).toEqual([]);

    const on = projectOf({ on: ["unslop", "technical-writing"] });
    const { actions } = run(index, [start, promptAt(on), ran("git status"), ran("git push")]);
    expect(lines(actions)).toEqual([
      `switched unslop on: ${QUALITY} switches it on`,
      `switched technical-writing on: ${QUALITY} switches it on`,
      "inject unslop: always",
      "deliver technical-writing: tool-call matched bash.command against **git push**",
    ]);
  });

  test("a Rule the Selection leaves off fires on no trigger until a project switches it on", () => {
    // Every firing path asks switchedOn first, so this map names one trigger of each
    // predicate kind. A new predicate kind fails the typecheck until it has a case here.
    const dormantTrigger = {
      always: always,
      "repo-contains": typescript,
      declares: { predicate: "declares", key: "effect" },
      "file-matches": onWrite,
      "tool-call": onPush,
    } satisfies Record<Predicate, ScopeCondition>;
    const firing: Record<Predicate, () => Event[]> = {
      always: () => [start, prompt],
      "repo-contains": () => [start, promptIn("src/a.ts")],
      declares: () => [start, promptAt(projectOf({ declares: ["effect"] }))],
      "file-matches": () => [start, promptAt(projectOf()), wrote("src/a.ts")],
      "tool-call": () => [start, promptAt(projectOf()), ran("git push")],
    };
    const switched: Record<Predicate, (name: string) => Event[]> = {
      always: (name) => [start, promptAt(projectOf({ on: [name] }))],
      "repo-contains": (name) => [start, promptAt(projectOf({ on: [name] }), "src/a.ts")],
      declares: (name) => [start, promptAt(projectOf({ declares: ["effect"], on: [name] }))],
      "file-matches": (name) => [start, promptAt(projectOf({ on: [name] })), wrote("src/a.ts")],
      "tool-call": (name) => [start, promptAt(projectOf({ on: [name] })), ran("git push")],
    };
    for (const kind of PREDICATES) {
      const name = `dormant-${kind}`;
      const index = dormant(ruled([[name, dormantTrigger[kind]]]));
      expect(run(index, firing[kind]()).actions, `an inactive Rule fired on ${kind}`).toEqual([]);
      expect(injected(run(index, switched[kind](name)).actions), `a switched-on Rule stayed silent on ${kind}`).toEqual([name]);
    }
  });

  test("a switch that changes nothing says nothing", () => {
    const { actions } = run(unslopAndAsleep, [start, promptAt(projectOf({ on: ["unslop"], off: ["asleep"] }))]);
    expect(lines(actions)).toEqual(["inject unslop: always"]);
  });

  test("a switch naming a Rule the index does not carry is reported as the Dispatcher's, and nothing else changes", () => {
    const index = ruled([["unslop", always]]);
    const { actions } = run(index, [start, promptAt(projectOf({ on: ["unslopp"], off: ["prove-it-work"] }))]);
    expect(lines(actions)).toEqual([
      `broken dispatcher: ${QUALITY} switches unslopp on, and pi carries no Rule of that name`,
      `broken dispatcher: ${QUALITY} switches prove-it-work off, and pi carries no Rule of that name`,
      "inject unslop: always",
    ]);
  });

  test("the switches are said once for each project a session stands in, and again in the next session", () => {
    const index = ruled([["unslop", always]]);
    const here = projectOf({ off: ["unslop"] });
    const there = { ...here, path: "/elsewhere/package.json" };
    const { actions } = run(index, [start, promptAt(here), promptAt(here), promptAt(there), start, promptAt(there)]);
    expect(lines(actions)).toEqual([
      `switched unslop off: ${QUALITY} switches it off`,
      "switched unslop off: /elsewhere/package.json switches it off",
      "switched unslop off: /elsewhere/package.json switches it off",
    ]);
  });

  test("a Rule the project switches off after it was injected is not injected again when a compaction drops it", () => {
    const index = ruled([["unslop", always]]);
    const off = projectOf({ off: ["unslop"] });
    const { actions } = run(index, [start, promptAt(projectOf()), promptAt(off), compaction, promptAt(off)]);
    expect(injected(actions)).toEqual(["unslop"]);
    expect(injected(run(index, [start, promptAt(projectOf()), compaction, promptAt(projectOf())]).actions)).toEqual(["unslop", "unslop"]);
  });

  test("a package.json that cannot be read switches nothing, so the Selection's defaults stand", () => {
    expect(injected(run(unslopAndAsleep, [start, promptAt(unreadable)]).actions)).toEqual(["unslop"]);
  });

  test("the switches outlive the hook process that heard them, so a later tool call still honours them", () => {
    const index = ruled([["typescript-best-practices", onWrite]]);
    const heard = run(index, [start, promptAt(projectOf({ off: ["typescript-best-practices"] }))]).state;
    expect(dispatch(index, wrote("src/a.ts"), roundTripped(heard)).actions).toEqual([]);
  });

  test("a Profile leaves an unlisted Rule available to a project switch", () => {
    const index: Index = {
      ...dormant(ruled([
        ["unslop", always],
        ["force-determinism", always],
      ])),
      profiles: [{ name: "default", models: [], rules: [], skills: [], references: [] }, { name: "luna", models: ["openai-codex/gpt-6-luna"], rules: ["force-determinism"], skills: [], references: [] }],
    };
    const { actions } = run(index, [
      start,
      {
        type: "prompt",
        model: "openai-codex/gpt-6-luna",
        project: projectOf({ on: ["unslop"] }),
      },
    ]);
    expect(injected(actions)).toEqual(["unslop"]);
  });

  test("a project switch can activate a dormant Rule absent from every Profile", () => {
    const index: Index = { ...dormant(ruled([["unslop", always]])), profiles: [{ name: "default", models: [], rules: [], skills: [], references: [] }] };
    const { actions } = run(index, [start, { type: "prompt", project: projectOf({ on: ["unslop"] }), model: "ollama/future" }]);
    expect(injected(actions)).toEqual(["unslop"]);
  });
});

describe("a context that never gets a session start", () => {
  const index = ruled([
    ["unslop", always],
    ["typescript-best-practices", typescript],
    ["software-design", { predicate: "repo-contains", glob: "**/*" }],
  ]);

  test("it holds every Rule its own repository earns, not just the `always` set", () => {
    expect(injected(run(index, [promptIn("src/a.ts")]).actions)).toEqual([
      "unslop",
      "typescript-best-practices",
      "software-design",
    ]);
  });

  test("it holds exactly what a session that was announced in the same repository holds", () => {
    const announced = run(index, [start, promptIn("src/a.ts")]);
    const unannounced = run(index, [promptIn("src/a.ts")]);
    expect(injected(unannounced.actions)).toEqual(injected(announced.actions));
  });

  test("it is asked about its own repository and not the one that spawned it", () => {
    expect(injected(run(index, [promptIn("notes.txt")]).actions)).toEqual(["unslop", "software-design"]);
  });

  test("it injects once, however many turns it takes", () => {
    expect(injected(run(index, [promptIn("src/a.ts"), promptIn("src/a.ts"), promptIn("src/a.ts")]).actions)).toEqual([
      "unslop",
      "typescript-best-practices",
      "software-design",
    ]);
  });
});

describe("file-matches", () => {
  const index = ruled([["typescript-best-practices", onWrite]]);

  test("a write to a matching path reaches the model inside the turn that wrote it", () => {
    const { actions } = run(index, [prompt, wrote("src/a.ts"), prompt]);
    expect(actions.map((a) => a.type)).toEqual(["deliver"]);
    expect(injected(actions)).toEqual(["typescript-best-practices"]);
  });

  test("a write to a path that does not match does nothing", () => {
    expect(run(index, [wrote("README.md"), prompt]).actions).toEqual([]);
  });

  test("a tool call that writes nothing does nothing", () => {
    expect(run(index, [ran("touch src/a.ts"), prompt]).actions).toEqual([]);
  });

  test("twenty writes inject the text once, not twenty times", () => {
    const writes = Array.from({ length: 20 }, (_, i) => wrote(`src/file-${i}.ts`));
    const { actions } = run(index, [...writes, prompt, ...writes, prompt]);
    expect(injected(actions)).toEqual(["typescript-best-practices"]);
  });
});

describe("tool-call", () => {
  const index = ruled([["push-with-care", onPush]]);

  test("a matching tool and argument reaches the model inside the turn that called it", () => {
    const { actions } = run(index, [ran("git push origin main"), prompt]);
    expect(actions.map((a) => a.type)).toEqual(["deliver"]);
    expect(injected(actions)).toEqual(["push-with-care"]);
  });

  test("the right tool with an argument that does not match does nothing", () => {
    expect(run(index, [ran("git status"), prompt]).actions).toEqual([]);
  });

  test("an argument that is not a path is still matched across its separators", () => {
    expect(injected(run(index, [ran("git push origin feature/dispatcher"), prompt]).actions)).toEqual([
      "push-with-care",
    ]);
  });

  test("a matching tool called with a path argument matches with a path glob", () => {
    const onChangelog = ruled([
      ["changelog-guard", { predicate: "tool-call", tool: "write", argument: "path", matches: "**/CHANGELOG.md" }],
    ]);
    expect(injected(run(onChangelog, [wrote("docs/CHANGELOG.md"), prompt]).actions)).toEqual(["changelog-guard"]);
    expect(run(onChangelog, [wrote("docs/CHANGES.md"), prompt]).actions).toEqual([]);
  });

  test("another tool carrying the same text does nothing", () => {
    expect(run(index, [{ type: "tool-call", tool: "read", input: { command: "git push" } }, prompt]).actions).toEqual([]);
  });

  test("the tool is named without case, because two harnesses spell the same tool differently", () => {
    const said = run(index, [{ type: "tool-call", tool: "Bash", input: { command: "git push --force" } }]).actions;
    expect(said.map((a) => a.type), "the Rule did not fire for the harness that capitalises its tool").toEqual(["deliver"]);
  });

  test("naming an argument the tool was not called with is broken, not a non-match", () => {
    const typo = ruled([["push-with-care", { predicate: "tool-call", tool: "bash", argument: "cmd", matches: "*" }]]);
    const { actions } = run(typo, [ran("git push"), prompt]);
    expect(actions.map((a) => a.type)).toEqual(["broken"]);
    expect(logLine(nth(actions, 0))).toMatch(/push-with-care.*cmd.*command/);
  });
});

describe("injection", () => {
  test("the full Rule text is injected, not a pointer to it", () => {
    const index = ruled([["unslop", always]]);
    const [action] = run(index, [prompt]).actions;
    expect(action).toEqual({ type: "inject", rule: "unslop", why: "always", text: ruleText(index, "unslop") });
  });

  test("a Rule injects once per session however many times it matches", () => {
    const index = ruled([["unslop", always]]);
    expect(injected(run(index, [prompt, prompt, prompt]).actions)).toEqual(["unslop"]);
  });

  test("several Rules matching one event all inject, in declared order", () => {
    const index = ruled([
      ["first", always],
      ["second", typescript],
      ["third", always],
    ]);
    expect(injected(run(index, [start, promptIn("a.ts")]).actions)).toEqual(["first", "second", "third"]);
  });

  test("several Rules matching one write are delivered in declared order", () => {
    const index = ruled([
      ["first", onWrite],
      ["second", { predicate: "file-matches", glob: "**/*" }],
    ]);
    expect(delivered(run(index, [wrote("a.ts")]).actions)).toEqual(["first", "second"]);
  });
});

describe("a Rule that falls due mid-turn", () => {
  const index = ruled([["typescript-best-practices", onWrite]]);

  test("it is delivered where it matched, not at the prompt after it", () => {
    const { actions } = run(index, [wrote("src/a.ts"), wrote("src/b.ts"), wrote("src/c.ts")]);
    expect(delivered(actions)).toEqual(["typescript-best-practices"]);
    expect(actions.map((a) => a.type)).toEqual(["deliver"]);
  });

  test("it counts as injected, so the next prompt does not deliver it again", () => {
    const { actions, state } = run(index, [wrote("src/a.ts"), prompt, prompt]);
    expect(injected(actions)).toEqual(["typescript-best-practices"]);
    expect(state.rules).toEqual({ "typescript-best-practices": { state: "injected" } });
  });

  test("the log says what it was delivered for, and that it was delivered", () => {
    const action = nth(run(index, [wrote("src/a.ts")]).actions, 0);
    expect(logLine(action)).toBe("deliver typescript-best-practices: file-matches matched src/a.ts");
  });

  test("a `tool-call` Rule is delivered the same way, since it can only match mid-turn too", () => {
    const pushes = ruled([["push-with-care", onPush]]);
    const { actions } = run(pushes, [ran("git push origin main"), ran("git push origin main")]);
    expect(delivered(actions)).toEqual(["push-with-care"]);
    expect(logLine(nth(actions, 0))).toBe("deliver push-with-care: tool-call matched bash.command against **git push**");
  });

  test("a compaction takes it away again, and the prompt after that puts it back", () => {
    const { actions } = run(index, [wrote("src/a.ts"), compaction, prompt]);
    expect(actions.map((a) => a.type)).toEqual(["deliver", "queue", "inject"]);
  });

  test("a Rule a compaction re-armed is delivered on the next match, not left waiting", () => {
    const { actions } = run(index, [wrote("src/a.ts"), compaction, wrote("src/b.ts"), prompt]);
    expect(actions.map((a) => a.type)).toEqual(["deliver", "queue", "deliver"]);
  });
});

describe("a Rule with more than one trigger", () => {
  const commits: ScopeCondition = { predicate: "tool-call", tool: "bash", argument: "command", matches: "**git commit**" };
  const index = ruled([["technical-writing", [onWrite, onPush, commits]]]);

  test("it fires when any of its triggers matches", () => {
    expect(delivered(run(index, [wrote("src/a.ts")]).actions)).toEqual(["technical-writing"]);
    expect(delivered(run(index, [ran("git commit -m 'x'")]).actions)).toEqual(["technical-writing"]);
  });

  test("it injects at most once, however many of its triggers match", () => {
    const { actions, state } = run(index, [wrote("a.ts"), ran("git commit -m 'x'"), ran("git push"), prompt]);
    expect(injected(actions)).toEqual(["technical-writing"]);
    expect(state.rules).toEqual({ "technical-writing": { state: "injected" } });
  });

  test("the log names the trigger that fired, not just the Rule", () => {
    const committed = nth(run(index, [ran("git commit -m 'x'")]).actions, 0);
    expect(logLine(committed)).toBe("deliver technical-writing: tool-call matched bash.command against **git commit**");
    const pushed = nth(run(index, [ran("git push origin")]).actions, 0);
    expect(logLine(pushed)).toBe("deliver technical-writing: tool-call matched bash.command against **git push**");
  });

  test("prompt-time triggers fire the same way: the first alternative that matches names the why", () => {
    const both = ruled([["either", [typescript, always]]]);
    const action = nth(run(both, [promptIn("src/a.ts")]).actions, 0);
    expect(logLine(action)).toBe("inject either: repo-contains matched src/a.ts");
    const elsewhere = nth(run(both, [promptIn("main.rs")]).actions, 0);
    expect(logLine(elsewhere)).toBe("inject either: always");
  });

  test("one broken alternative is reported without silencing the ones that work", () => {
    const { actions } = run(index, [{ type: "tool-call", tool: "bash", input: {} }]);
    expect(actions.map((a) => a.type)).toEqual(["broken", "broken"]);
    const written = run(index, [{ type: "tool-call", tool: "bash", input: {} }, wrote("src/a.ts")]);
    expect(delivered(written.actions)).toEqual(["technical-writing"]);
  });
});

