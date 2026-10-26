import { expect, test } from "bun:test";
import { hub } from "../../src/generate/hub";
import { selected } from "../../src/bodies/selection";
import { value } from "../lib/effect";
import { bodies, repo, selection } from "../lib/tree";

test("the grilling skill reaches every Profile, and its Hub entry carries its source's license", async () => {
  const skill = bodies.find((body) => body.name === "grilling" && body.kind === "skill") ?? expect.unreachable("grilling skill is absent");
  expect(skill.source).toBe("https://github.com/mattpocock/skills@c55ee46073ed923f86ce59a5eb3b6d895095d1b7");
  expect(selection.profiles.length).toBeGreaterThan(0);
  for (const profile of selection.profiles) {
    expect(profile.skills, `${profile.name} cannot invoke grilling`).toContain("grilling");
  }
  const reached = selected(bodies, selection);
  expect(reached).toContain(skill);
  const entry = value(hub(reached)).get("grilling") ?? expect.unreachable("the Hub offers no grilling entry");
  const license = await Bun.file(`${repo}${entry}/LICENSE`).text();
  expect(license).toContain("MIT License");
  expect(license).toContain("Copyright (c) 2026 Matt Pocock");
});
