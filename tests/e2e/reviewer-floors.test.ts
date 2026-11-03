import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MACHINES } from "../../src/generate/machine";
import { noMistakesConfigOf } from "../../src/generate/no-mistakes-config";

const JQ = Bun.which("jq") ?? expect.unreachable("the reviewer floors pipe through jq, which is not on PATH");

const codexStatus = (fiveHour: number, { weekly = 84, stale = false } = {}) => ({
  schemaVersion: 5,
  providers: [
    { provider: "claude", state: { status: "fresh", stale: false }, windows: [{ id: "five_hour", percentRemaining: 90 }] },
    {
      provider: "codex",
      state: { status: stale ? "stale" : "fresh", stale },
      windows: [
        { id: "five_hour", percentRemaining: fiveHour },
        { id: "weekly", percentRemaining: weekly },
      ],
    },
  ],
});

async function runFloor(command: string, tools: Readonly<Record<string, string>>): Promise<{ code: number; stdout: string }> {
  const dir = await mkdtemp(join(tmpdir(), "skills-reviewer-floor-"));
  try {
    for (const [tool, script] of Object.entries(tools)) {
      await writeFile(join(dir, tool), `#!/bin/sh\n${script}\n`);
      await chmod(join(dir, tool), 0o755);
    }
    const ran = Bun.spawnSync(["sh", "-c", command], { env: { PATH: `${dir}:${dirname(JQ)}:/usr/bin:/bin`, TMPDIR: dir } });
    return { code: ran.exitCode, stdout: ran.stdout.toString() };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const printing = (body: unknown) => `cat <<'JSON'\n${JSON.stringify(body)}\nJSON`;

const HOME = "/home/someone";

const codexFloorOf = (machine: (typeof MACHINES)[number]) => noMistakesConfigOf(machine, HOME).reviewer_chain[1].floor.command;

test.each([...MACHINES])("the %s Codex floor reads the five-hour window quota-axi reports", async (machine) => {
  const ran = await runFloor(codexFloorOf(machine), { "quota-axi": printing(codexStatus(52)) });
  expect(ran).toEqual({ code: 0, stdout: `${JSON.stringify({ remaining_percent: 52 }, null, 2)}\n` });
});

test.each([...MACHINES])("the %s Codex floor leaves the weekly window out of the five-hour reading", async (machine) => {
  const ran = await runFloor(codexFloorOf(machine), { "quota-axi": printing(codexStatus(55, { weekly: 0 })) });
  expect(ran).toEqual({ code: 0, stdout: `${JSON.stringify({ remaining_percent: 55 }, null, 2)}\n` });
});

test.each([...MACHINES])("the %s Codex floor reports no percentage when quota-axi serves a stale cached five-hour window", async (machine) => {
  const ran = await runFloor(codexFloorOf(machine), { "quota-axi": printing(codexStatus(80, { stale: true })) });
  expect(ran).toEqual({ code: 0, stdout: `${JSON.stringify({ remaining_percent: null }, null, 2)}\n` });
});
