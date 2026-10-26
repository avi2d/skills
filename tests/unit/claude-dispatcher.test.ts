import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBodies } from "../../src/bodies/bodies";
import { CONTEXT_LIMIT, HAND_OFF_WAIT_SECONDS, PROMPT_HOOKS, parts } from "../../src/dispatcher/claude-dispatcher";
import { HOOKS, type Reply } from "../../src/dispatcher/hook-harness";
import { carriage, type Index } from "../../src/dispatcher/dispatch";
import { indexFor } from "../../src/generate/dispatch-index";
import { loadSelection, profilesOf, selected } from "../../src/bodies/selection";
import { carriageFor } from "../lib/dispatch";
import { valueOf } from "../lib/effect";

const repo = new URL("../../", import.meta.url).pathname;

const reply = (rules: string[], text: string[] = []): Reply => ({ rules, text, refuse: false, told: [] });

const sized = (name: string, size: number) => ({
  name,
  triggers: [{ predicate: "always" as const }],
  text: `# ${name}\n\n${"word ".repeat(size / 5)}`.slice(0, size),
});

const index: Index = {
  harness: "claude-code",
  rules: [sized("first", 4000), sized("second", 4000), sized("third", 4000)],
  profiles: [],
  hub: [],
};

describe("what one hook's reply is cut into", () => {
  test("with no limit it is one part, the carriage and then the texts, as a single hook has always said it", () => {
    const all = ["first", "second", "third"];
    expect(parts(index, reply(all, ["Run the ship Skill now."]), Number.POSITIVE_INFINITY)).toEqual([
      `${carriage(index, all)}\n\nRun the ship Skill now.`,
    ]);
  });

  test("past the limit every part stays within it and every Rule is whole in exactly one", () => {
    const split = parts(index, reply(["first", "second", "third"]), CONTEXT_LIMIT);
    expect(split).toEqual([carriageFor(index, ["first", "second"]), carriageFor(index, ["third"])]);
    for (const part of split) expect(part.length).toBeLessThanOrEqual(CONTEXT_LIMIT);
  });

  test("a text rides in the last part while it fits, and takes a part of its own once it does not", () => {
    expect(parts(index, reply(["third"], ["short"]), CONTEXT_LIMIT)).toEqual([`${carriage(index, ["third"])}\n\nshort`]);
    const long = "x".repeat(CONTEXT_LIMIT - 100);
    expect(parts(index, reply(["third"], [long]), CONTEXT_LIMIT)).toEqual([carriageFor(index, ["third"]), long]);
  });

  test("nothing to say is no parts", () => {
    expect(parts(index, reply([]), CONTEXT_LIMIT)).toEqual([]);
  });
});

describe("the prompt hooks the settings run", () => {
  const Hooked = Schema.Struct({ command: Schema.optionalKey(Schema.String), timeout: Schema.optionalKey(Schema.Finite) });
  const settings = Schema.decodeUnknownSync(
    Schema.Struct({
      hooks: Schema.optionalKey(Schema.Struct({ UserPromptSubmit: Schema.optionalKey(Schema.Array(Schema.Struct({ hooks: Schema.optionalKey(Schema.Array(Hooked)) }))) })),
    }),
  )(JSON.parse(readFileSync(join(repo, "harness/claude-code/settings.json"), "utf8")));
  const prompted = (settings.hooks?.UserPromptSubmit ?? [])
    .flatMap((entry) => entry.hooks ?? [])
    .filter((hook) => hook.command?.includes("skills-dispatch"));

  test("the Dispatcher's prompt hook runs once per part the Dispatcher can hand out, numbered from the second", () => {
    const expected = Array.from({ length: PROMPT_HOOKS }, (_, i) =>
      `bun "$HOME/.claude/skills-dispatch/index.ts" UserPromptSubmit${i === 0 ? "" : `/${i + 1}`}`,
    );
    expect(prompted.map((hook) => hook.command), "a part with no hook to carry it never reaches the model").toEqual(expected);
  });

  test("a later prompt hook names no hook, so a Dispatcher that knows nothing of parts leaves it alone", () => {
    for (const hook of prompted.slice(1)) {
      const [, named = ""] = /index\.ts" (\S+)/.exec(hook.command ?? "") ?? [];
      expect(named, "the argument after the Dispatcher was read wrong").toStartWith("UserPromptSubmit");
      expect((HOOKS as readonly string[]).includes(named), `${named} would dispatch the prompt again in a Dispatcher built before parts`).toBe(false);
    }
  });

  test("a later prompt hook waits longer than the first can run, and Claude Code waits longer than it does", () => {
    const [first, ...later] = prompted;
    expect(first?.timeout ?? 0).toBeLessThan(HAND_OFF_WAIT_SECONDS);
    for (const hook of later) expect(hook.timeout ?? 0).toBeGreaterThan(HAND_OFF_WAIT_SECONDS);
  });

  test("every Rule the Selection turns on, due at one prompt, fits those hooks without a part past the limit", async () => {
    const checkedIn = await valueOf(
      Effect.gen(function* () {
        const selection = yield* loadSelection(repo);
        const chosen = selected(yield* loadBodies(repo), selection);
        return yield* indexFor("claude-code", chosen, yield* profilesOf(chosen, selection));
      }),
    );
    expect(checkedIn.rules.length, "no Rule was read, so this proves nothing").toBeGreaterThan(0);
    const split = parts(checkedIn, reply(checkedIn.rules.map((rule) => rule.name)), CONTEXT_LIMIT);
    expect(split.length, `the Rules come to ${split.length} parts: add a prompt hook and raise PROMPT_HOOKS`).toBeLessThanOrEqual(PROMPT_HOOKS);
    for (const part of split) expect(part.length, "a Rule longer than Claude Code shows whole can only arrive as a preview").toBeLessThanOrEqual(CONTEXT_LIMIT);
  });
});
