import { expect, test } from "bun:test";
import { linksUnder } from "../../src/generate/link";
import { machineOn } from "../../src/generate/machine";
import { GENERATED_ROOT } from "../lib/generated-root";

test("every platform links orc's orchestrator rules to ~/.orc/orchestrator.md, not to a generated copy", () => {
  for (const os of ["darwin", "linux", "win32"] as const) {
    expect(linksUnder(GENERATED_ROOT, machineOn(os))[".orc/orchestrator.md"], os).toBe("harness/orc/orchestrator.md");
  }
});
