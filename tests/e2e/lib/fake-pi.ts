import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function fakePi(script: string): Promise<{ pi: string; discard: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "skills-fake-pi-"));
  const pi = `${dir}/pi`;
  await writeFile(pi, `#!/bin/sh\n${script}\n`);
  await chmod(pi, 0o755);
  return { pi, discard: () => rm(dir, { recursive: true, force: true }) };
}
