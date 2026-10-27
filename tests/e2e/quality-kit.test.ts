import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Schema } from "effect";
import { trackedFiles } from "./lib/git";

const repo = new URL("../../", import.meta.url).pathname;
const DEPCRUISE = `${repo}node_modules/dependency-cruiser/bin/dependency-cruiser.mjs`;
const CHECKS_GRAPHWALK = `${repo}node_modules/.bin/checks-graphwalk`;
const typescript = /\.[cm]?tsx?$/;
const spawnTimeoutMs = 30_000;
const cruiseResult = Schema.decodeUnknownSync(Schema.Struct({
  modules: Schema.Array(Schema.Struct({ source: Schema.String })),
  summary: Schema.Struct({ error: Schema.Int, warn: Schema.Int }),
}));

test("the dependency rules cruise every authored TypeScript module, not an empty graph", async () => {
  const authored = (await trackedFiles(repo)).filter((path) => typescript.test(path));
  expect(authored.length).toBeGreaterThan(0);
  const ran = Bun.spawnSync([process.execPath, DEPCRUISE, "--config", "dependency-cruiser.config.ts", "--output-type", "json", ...authored], {
    cwd: repo,
  });
  expect(ran.exitCode, ran.stderr.toString()).toBe(0);
  const graph = cruiseResult(JSON.parse(ran.stdout.toString()));
  expect({ error: graph.summary.error, warn: graph.summary.warn }).toEqual({ error: 0, warn: 0 });
  const cruised = new Set(graph.modules.map((module) => module.source));
  expect(authored.filter((path) => !cruised.has(path)), "dependency-cruiser skipped authored modules").toEqual([]);
}, { timeout: spawnTimeoutMs });

test("the lint fails a tracked module outside src, harness and tests that imports nothing installed", async () => {
  const scratch = mkdtempSync(join(realpathSync(tmpdir()), "skills-checks-graphwalk-"));
  try {
    const offenders = ["scripts/x.ts", "tools/x.mts", "bin/x.cts"];
    writeFileSync(join(scratch, "dependency-cruiser.config.ts"), await Bun.file(`${repo}dependency-cruiser.config.ts`).text());
    symlinkSync(`${repo}node_modules`, join(scratch, "node_modules"));
    for (const path of offenders) {
      mkdirSync(join(scratch, dirname(path)), { recursive: true });
      writeFileSync(join(scratch, path), 'import "no-such-package";\n');
    }
    await Bun.$`git init -q && git add -- dependency-cruiser.config.ts ${offenders}`.cwd(scratch);
    const ran = Bun.spawnSync([CHECKS_GRAPHWALK], { cwd: scratch });
    const unresolvable = ran.stderr
      .toString()
      .split("\n")
      .flatMap((line) => /^ {2}error not-to-unresolvable: (\S+) → /.exec(line)?.slice(1, 2) ?? []);
    expect(unresolvable.toSorted(), ran.stderr.toString()).toEqual(offenders.toSorted());
    expect(ran.exitCode).toBe(1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, { timeout: spawnTimeoutMs });
