import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";

process.env.SKILLS_UNDER_TEST = "1";
const own = `generated-${process.pid}`;
process.env.SKILLS_GENERATED_ROOT = own;

const { checkout } = await import("../../src/generate/generate");
const { readGeneratedRoot } = await import("../../src/generate/bundle");
const { value, valueOf } = await import("./effect");
const { REPO } = await import("../../src/generate/link");

// `bun test` never runs a preload's exit hooks, so every process leaves its
// directory behind. A recycled pid inherits its predecessor's, so this process
// starts empty and takes out what dead pids left.
rmSync(`${REPO}${own}`, { recursive: true, force: true });
mkdirSync(`${REPO}${own}`);

const dead = (pid: string): boolean => {
  try {
    process.kill(Number.parseInt(pid, 10), 0);
    return false;
  } catch {
    return true;
  }
};

for (const entry of readdirSync(REPO)) {
  const pid = /^generated-(\d+)$/.exec(entry)?.[1];
  if (pid === undefined || entry === own || !dead(pid)) continue;
  // The rename is atomic, so of all the sweepers racing for one dead directory exactly one removes it.
  // Staging inside this process's own root keeps the remove out of every directory another process reads.
  const taken = `${REPO}${own}/.sweep-${pid}`;
  try {
    renameSync(`${REPO}${entry}`, taken);
  } catch {
    continue;
  }
  rmSync(taken, { recursive: true, force: true });
}

// Any other root is shared with every concurrent test process, and their writes into it race. Generating
// nothing leaves the suite to fail on the root it was handed.
if (value(readGeneratedRoot) === own) await valueOf(checkout(REPO));
