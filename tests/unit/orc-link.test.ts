import { expect, test } from "bun:test";
import { linksUnder } from "../../src/generate/link";
import { GENERATED_ROOT } from "../lib/generated-root";

test("the link map points orc's orchestrator rules at ~/.orc/orchestrator.md, not at a generated copy", () => {
  expect(linksUnder(GENERATED_ROOT)[".orc/orchestrator.md"]).toBe("harness/orc/orchestrator.md");
});
