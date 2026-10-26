import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { filesUnder } from "../../src/platform/files";
import { valueOf } from "../lib/effect";
import { GENERATED_ROOT } from "../lib/generated-root";

// Each test spawns the generator, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(30_000);

const repo = new URL("../../", import.meta.url).pathname;
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("generate --check", () => {
  const snapshot = async (dir: string): Promise<Map<string, string>> => {
    const files = await valueOf(filesUnder(dir)).catch((err: unknown) => {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") return [];
      throw err;
    });
    return new Map(
      await Promise.all(files.map(async (rel): Promise<[string, string]> => [rel, Bun.SHA256.hash(await Bun.file(`${dir}/${rel}`).bytes(), "hex")])),
    );
  };

  test("exits 0 on a tree the generator wrote, and writes nothing", async () => {
    const before = await snapshot(`${repo}${GENERATED_ROOT}`);
    expect(before.size, "there is no generated tree to check - run `bun run generate`").toBeGreaterThan(0);

    // Without `env`, Bun hands the child the environment this process started with, which predates the
    // private root the preload names.
    const proc = Bun.spawnSync(["bun", "run", "generate", "--check"], { cwd: repo, env: process.env });
    expect(proc.exitCode, decode(proc.stderr)).toBe(0);
    expect(decode(proc.stdout)).toContain("matches the Bodies");

    expect(await snapshot(`${repo}${GENERATED_ROOT}`), "the check wrote to the tree it was reading").toEqual(before);
  });
});
