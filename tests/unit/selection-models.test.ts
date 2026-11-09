import { expect, test } from "bun:test";
import { noMistakesConfigOf } from "../../src/generate/no-mistakes-config";
import { selection } from "../lib/tree";

const from = new Map<string, Set<string>>();

const at = (model: string, config: string): void => {
  from.set(model, (from.get(model) ?? new Set()).add(config));
};

const mistakes = noMistakesConfigOf("/home/someone");
at(mistakes.agent_config.claude.model, "the no-mistakes config agent_config.claude");
at(mistakes.agent_config.pi.model, "the no-mistakes config agent_config.pi");
for (const reviewer of mistakes.reviewer_chain) at(reviewer.model, "the no-mistakes config reviewer_chain");

test("every model the generated configs name runs from a profile or the default set", () => {
  const placed = new Set([...selection.profiles.flatMap((profile) => profile.models), ...selection.defaultModels]);
  const uncovered = [...from.entries()]
    .filter(([model]) => !placed.has(model))
    .map(([model, configs]) => model + " from " + [...configs].join(", "));
  expect(uncovered).toEqual([]);
});
