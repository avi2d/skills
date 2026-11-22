import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import { REPO } from "../../src/generate/link";

test("missing, extra and different settings are not reported as clean", async () => {
  const home = await mkdtemp(join(tmpdir(), "skills-pi-drift-"));
  const path = join(home, ".pi/agent/settings.json");
  try {
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    const original = await readFile(join(REPO, "harness/pi/settings.json"), "utf8");
    const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)));
    const settings = { ...decode(original) };
    delete settings.compaction;
    settings.defaultProvider = "different-provider";
    settings.unexpected = true;
    settings.deviceId = "own-device";
    const drifted = JSON.stringify(settings);
    await writeFile(path, drifted);
    const run = () => Bun.spawn(["bun", "run", "check-pi-settings"], {
      cwd: REPO,
      env: { ...process.env, HOME: home, TMPDIR: home },
      stdout: "pipe",
      stderr: "pipe",
    });
    const drift = run();
    const output = await new Response(drift.stdout).text();
    expect(await drift.exited).toBe(1);
    expect(output).toContain("missing compaction");
    expect(output).toContain("different defaultProvider");
    expect(output).toContain("extra unexpected");
    expect(output).not.toContain("deviceId");
    expect(await readFile(path, "utf8")).toBe(drifted);

    const cleanSettings = { ...decode(original) };
    cleanSettings.deviceId = "own-device";
    await writeFile(path, JSON.stringify(cleanSettings));
    const clean = run();
    expect(await new Response(clean.stdout).text()).toContain("clean");
    expect(await clean.exited).toBe(0);

    await rm(path);
    const missing = run();
    expect(await new Response(missing.stdout).text()).toContain("settings file missing");
    expect(await missing.exited).toBe(1);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
