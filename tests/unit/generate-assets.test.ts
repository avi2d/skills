import { expect, test } from "bun:test";
import { hub } from "../../src/generate/hub";
import { selected } from "../../src/bodies/selection";
import { dirOf, HARNESSES } from "../../src/bodies/bodies";
import { value } from "../lib/effect";
import { bodies, selection } from "../lib/tree";

test("generate-assets reaches every Profile, every harness and the Hub, rather than only the Codex sessions it runs", () => {
  const skill =
    bodies.find((body) => body.name === "generate-assets" && body.kind === "skill") ?? expect.unreachable("generate-assets skill is absent");
  expect(selection.profiles.length).toBeGreaterThan(0);
  for (const profile of selection.profiles) {
    expect(profile.skills, `${profile.name} cannot invoke generate-assets`).toContain("generate-assets");
  }
  expect(skill.harnesses ?? HARNESSES).toEqual([...HARNESSES]);
  const reached = selected(bodies, selection);
  expect(reached).toContain(skill);
  expect(value(hub(reached)).get("generate-assets"), "the Hub offers no generate-assets entry").toBe(dirOf(skill));
});
