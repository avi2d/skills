import { expect, test } from "bun:test";
import { Effect } from "effect";
import { loadBodies } from "../../src/bodies/bodies";
import type { Event } from "../../src/dispatcher/dispatch";
import { indexFor } from "../../src/generate/dispatch-index";
import { readProject } from "../../src/dispatcher/project";
import { dormantRules, loadSelection, profilesOf, selected } from "../../src/bodies/selection";
import { injected, kept, promptAt, run } from "../lib/dispatch";
import { valueOf } from "../lib/effect";
import { trackedFiles } from "./lib/git";

const repo = new URL("../../", import.meta.url).pathname;
const index = await valueOf(
  Effect.gen(function* () {
    const bodies = yield* loadBodies(repo);
    const selection = yield* loadSelection(repo);
    const chosen = selected(bodies, selection);
    const profiles = yield* profilesOf(bodies, selection);
    return yield* indexFor("pi", chosen, profiles, dormantRules(bodies, chosen));
  }),
);
const thisRepo = await trackedFiles(repo);
const thisProject = readProject(repo) ?? expect.unreachable(`${repo} is not a git checkout, so this proves nothing`);
const start: Event = { type: "session-start" };
const promptIn = (...files: string[]): Event => ({ type: "prompt", files });
const startedOn = (model: string): Event => ({ type: "session-start", model });
const promptOn = (model: string, ...files: string[]): Event => ({ type: "prompt", model, files });

const declared = "declares" in thisProject ? thisProject.declares : expect.unreachable(`${thisProject.path} is unreadable, so this proves nothing`);
const switching = (on: string[], ...files: string[]): Event => promptAt({ path: thisProject.path, declares: declared, on, off: [] }, ...files);

test("a sub-agent reviewing this repo holds the Rules its files call for, and none of the Rules that wait for a write", () => {
  expect(thisRepo.length, "this checkout listed no files, so this proves nothing").toBeGreaterThan(0);
  const { actions } = run(index, [promptAt(thisProject, ...thisRepo)]);
  expect(injected(actions), "this repository is TypeScript").toContain("typescript-best-practices");
  expect(injected(actions), "effect-error-channel is cut from the default selection").not.toContain("effect-error-channel");
  const switchedOn = run(index, [switching(["effect-error-channel"], ...thisRepo)]);
  expect(injected(switchedOn.actions), "a project can switch the cut Rule back on, and this repository's package.json depends on Effect").toContain("effect-error-channel");
  const readOnly = run(index, [switching(["agent-docs", "writing-for-people"], ...thisRepo)]);
  expect(injected(readOnly.actions), "agent-docs fires on a write, and this session only read").not.toContain("agent-docs");
  expect(injected(readOnly.actions), "writing-for-people is in force from the prompt").toContain("writing-for-people");
  expect(readOnly.actions.flatMap((action) => (action.type === "switched" ? [action.rule] : [])), "the default Profile leaves both out, so both switches change something").toEqual(["agent-docs", "writing-for-people"]);
});

test("a write to one of this repo's own Bodies sends the session to the `writing-for-agents` reference, once a project switches the cut agent-docs Rule on", () => {
  const body = thisRepo.find((path) => path.endsWith("/SKILL.md")) ?? expect.unreachable("this checkout tracks no SKILL.md, so this proves nothing");
  const wrote: Event = { type: "tool-call", tool: "write", input: { path: `${repo}${body}` }, writes: [`${repo}${body}`] };
  const { actions } = run(index, [switching(["agent-docs", "writing-for-people"], ...thisRepo), wrote]);
  const delivered = actions.flatMap((action) => (action.type === "deliver" ? [action] : []));
  expect(delivered.map((action) => action.rule), body).toEqual(["agent-docs"]);
  expect(delivered.map((action) => action.text).join("\n")).toInclude("`writing-for-agents` reference");
});

test("each model Profile scopes only its named Rules", () => {
  const changelog = "CHANGELOG.md";
  const luna = "openai-codex/gpt-6-luna";
  const muse = "opencode-go/muse-spark-1.3-contributor";
  const lunaProfile = index.profiles.find((profile) => profile.models.includes(luna));
  expect(lunaProfile?.name, "selection.toml declares no Profile for the GPT models").toBe("gpt-6");
  const lunaActions = run(index, [
    startedOn(luna),
    promptOn(luna, ...thisRepo),
    { type: "tool-call", tool: "write", input: { path: changelog }, writes: [changelog] },
  ]).actions;
  expect(injected(lunaActions)).toContain("force-determinism");
  expect(injected(lunaActions)).toContain("git-hygiene");
  expect(injected(lunaActions)).toContain("typescript-best-practices");
  expect(injected(lunaActions)).not.toContain("guard-the-context-window");
  expect(injected(lunaActions)).not.toContain("git-hygiene-co-author");
  expect(injected(lunaActions)).not.toContain("writing-for-people");

  const museActions = run(index, [
    startedOn(muse),
    promptOn(muse, ...thisRepo),
    { type: "tool-call", tool: "write", input: { path: changelog }, writes: [changelog] },
  ]).actions;
  expect(injected(museActions)).toContain("guard-the-context-window");
  expect(injected(museActions)).toContain("writing-for-people");
  expect(injected(museActions)).toContain("typescript-best-practices");
  expect(injected(museActions)).not.toContain("force-determinism");
  expect(injected(museActions)).not.toContain("git-hygiene");
});

test("a harness without model identity takes the default Profile", () => {
  const { actions } = run(index, [
    start,
    promptIn(...thisRepo),
    { type: "tool-call", tool: "write", input: { path: "CHANGELOG.md" }, writes: ["CHANGELOG.md"] },
  ]);
  expect(injected(actions)).not.toContain("force-determinism");
  expect(injected(actions)).not.toContain("guard-the-context-window");
  expect(injected(actions)).not.toContain("git-hygiene");
  expect(injected(actions)).toContain("prove-it-works");
});

test("an exact ollama profile trims tools, while a future ollama model takes default", () => {
  const qwen = "ollama/qwen3.6:35b-a3b-iq3s";
  const local = index.profiles.find((profile) => profile.models.includes(qwen));
  expect(local?.name).toBe("ollama-qwen");
  const { actions } = run(index, [startedOn(qwen), promptOn(qwen, ...thisRepo)]);
  expect(injected(actions)).toEqual(["guard-the-context-window", "prove-it-works"]);
  expect(kept(actions)).toEqual(["read", "write", "edit", "bash"]);
  const future = run(index, [startedOn("ollama/future"), promptOn("ollama/future", ...thisRepo)]).actions;
  expect(injected(future)).not.toContain("guard-the-context-window");
  expect(kept(future)).toEqual([]);
});
