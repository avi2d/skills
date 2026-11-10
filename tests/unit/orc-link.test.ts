import { expect, test } from "bun:test";
import { LINKS } from "../lib/generated-root";

test("the link map points orc's orchestrator rules at ~/.orc/orchestrator.md, not at a generated copy", () => {
  expect(LINKS[".orc/orchestrator.md"]).toBe("harness/orc/orchestrator.md");
});
