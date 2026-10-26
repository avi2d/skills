import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skipReason } from "@avi2dg/checks/scripts/test-skips.ts";
import type { Machine } from "../../src/generate/machine";
import { noMistakesConfigOf, noMistakesYaml } from "../../src/generate/no-mistakes-config";
import { valueOf } from "../lib/effect";

const noMistakes = Bun.which("no-mistakes");

const loadGenerated = async (home: string, machine: Machine): Promise<string> => {
  writeFileSync(join(home, "config.yaml"), await valueOf(noMistakesYaml(noMistakesConfigOf(machine, home))));
  const proc = Bun.spawn([noMistakes ?? expect.unreachable("a config loads only where no-mistakes is installed"), "doctor"], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? home,
      TMPDIR: join(home, "tmp"),
      NM_HOME: home,
      // The consumer's detached update check writes back into NM_HOME after cleanup.
      NO_MISTAKES_NO_UPDATE_CHECK: "1",
    },
  });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  await proc.exited;
  return `${out}${err}`;
};

test.skipIf(!noMistakes)(
  skipReason(
    "it drives a real `no-mistakes doctor`, so it runs only where no-mistakes is installed; CI installs the pinned fork",
    "the generated mac no-mistakes config loads in the real consumer",
    "local",
  ),
  async () => {
    const home = mkdtempSync(join(tmpdir(), "skills-no-mistakes-"));
    try {
      const output = await loadGenerated(home, "mac");
      expect(output, "no-mistakes doctor rejected the generated mac config").toMatch(/gate validation.*pi is runnable/);
      expect(output, "no-mistakes doctor left the generated mac config unavailable").not.toContain("unavailable");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

test.skipIf(!noMistakes)(
  skipReason(
    "it drives a real `no-mistakes doctor`, so it runs only where no-mistakes is installed; CI installs the pinned fork",
    "the generated windows no-mistakes config loads in the real consumer",
    "local",
  ),
  async () => {
    const home = mkdtempSync(join(tmpdir(), "skills-no-mistakes-"));
    try {
      const output = await loadGenerated(home, "windows");
      expect(output, "no-mistakes doctor rejected the generated windows config").toMatch(/gate validation.*pi is runnable/);
      expect(output, "no-mistakes doctor left the generated windows config unavailable").not.toContain("unavailable");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);
