import { expect, test } from "bun:test";
import { crewDispatchOf } from "../../src/generate/crew-dispatch-config";
import { MACHINES } from "../../src/generate/machine";
import { CREW_DISPATCH } from "../../src/generate/machine-files";
import { noMistakesConfigOf } from "../../src/generate/no-mistakes-config";
import { selection } from "../lib/tree";

const from = new Map<string, Set<string>>();

const at = (model: string, config: string): void => {
  from.set(model, (from.get(model) ?? new Set()).add(config));
};

for (const machine of MACHINES) {
  const dispatch = crewDispatchOf(machine);
  for (const profile of [...dispatch.rules.flatMap((rule) => rule.use), ...dispatch.ownRules.flatMap((rule) => rule.use), ...dispatch.default]) {
    at(profile.model, CREW_DISPATCH[machine] + " on " + machine);
  }
  const mistakes = noMistakesConfigOf(machine, "/home/someone");
  at(mistakes.agent_config.claude.model, "the no-mistakes config agent_config.claude on " + machine);
  at(mistakes.agent_config.pi.model, "the no-mistakes config agent_config.pi on " + machine);
  for (const reviewer of mistakes.reviewer_chain) at(reviewer.model, "the no-mistakes config reviewer_chain on " + machine);
}

test("every model the generated configs name runs from a profile or the default set", () => {
  const placed = new Set([...selection.profiles.flatMap((profile) => profile.models), ...selection.defaultModels]);
  const uncovered = [...from.entries()]
    .filter(([model]) => !placed.has(model))
    .map(([model, configs]) => model + " from " + [...configs].join(", "));
  expect(uncovered).toEqual([]);
});
