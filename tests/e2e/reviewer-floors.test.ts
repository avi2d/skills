import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MACHINES } from "../../src/generate/machine";
import { noMistakesConfigOf } from "../../src/generate/no-mistakes-config";

type Sandbox = { readonly tools: Readonly<Record<string, string>>; readonly files?: Readonly<Record<string, string>> };

async function runFloor(command: (dir: string) => string, { tools, files = {} }: Sandbox): Promise<{ code: number; stdout: string }> {
  const dir = await mkdtemp(join(tmpdir(), "skills-reviewer-floor-"));
  try {
    for (const [tool, script] of Object.entries(tools)) {
      await writeFile(join(dir, tool), `#!/bin/sh\n${script}\n`);
      await chmod(join(dir, tool), 0o755);
    }
    for (const [path, body] of Object.entries(files)) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), body);
    }
    const ran = Bun.spawnSync(["sh", "-c", command(dir)], { env: { PATH: `${dir}:/usr/bin:/bin`, TMPDIR: dir } });
    return { code: ran.exitCode, stdout: ran.stdout.toString() };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const HOME = "/home/someone";

const keychainServiceOf = (configDir: string) => `Claude Code-credentials-${new Bun.CryptoHasher("sha256").update(configDir).digest("hex").slice(0, 8)}`;

type Login = "signed in" | "absent" | "empty";

const secondFloorOf = (machine: (typeof MACHINES)[number], login: Login) => {
  const [, second] = noMistakesConfigOf(machine, HOME).reviewer_chain;
  const loginDir = second.env.CLAUDE_CONFIG_DIR;
  const command = (dir: string) => second.floor.command.replaceAll(loginDir, join(dir, "login"));
  const credentials = { "signed in": { "login/.credentials.json": '{"claudeAiOauth":{}}' }, absent: {}, empty: { "login/.credentials.json": "" } }[login];
  const keychain = login === "signed in" ? `[ "$*" = "find-generic-password -s ${keychainServiceOf(loginDir)}" ]` : "exit 44";
  return [command, { tools: { security: keychain }, files: credentials }] as const;
};

test.each([...MACHINES])("the %s last reviewer runs Sol with no floor, which the fork always tries", (machine) => {
  const [, , sol] = noMistakesConfigOf(machine, HOME).reviewer_chain;
  expect(sol.model).toBe("openai/gpt-6.1-sol");
  expect("floor" in sol).toBe(false);
});

test.each([...MACHINES])("the %s Claude floor passes the whole allowance once the second login is signed in", async (machine) => {
  expect(await runFloor(...secondFloorOf(machine, "signed in"))).toEqual({ code: 0, stdout: '{"remaining_percent":100}\n' });
});

test.each([
  ["has no login", "absent"],
  ["holds an empty login file", "empty"],
] as const)("the Claude floor reports no percentage and exits non-zero, which no-mistakes reads as a skip, while the login folder %s", async (_, login) => {
  for (const machine of MACHINES) {
    const ran = await runFloor(...secondFloorOf(machine, login));
    expect(ran.stdout).toBe("");
    expect(ran.code).not.toBe(0);
  }
});
