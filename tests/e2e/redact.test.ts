import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLAUDE_BUNDLE } from "../../src/generate/bundle";
import { scrub, stringsIn, withStrings } from "../../src/dispatcher/redact";
import { githubToken, npmToken, wireguardKey, wireguardKeyFile } from "../lib/credentials";
import { GENERATED_ROOT } from "../lib/generated-root";
import { installedScanner } from "../lib/gitleaks";

const repo = new URL("../../", import.meta.url).pathname;
const BUNDLE = join(repo, GENERATED_ROOT, CLAUDE_BUNDLE.dir);

const roots: string[] = [];
const temporary = (): string => {
  const root = mkdtempSync(join(tmpdir(), "skills-redact-test-"));
  roots.push(root);
  return root;
};
beforeAll(installedScanner);
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// Each scan spawns gitleaks, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(60_000);

describe("a credential in tool output", () => {
  test("a GitHub token deep in the output is replaced where it stands, and the text around it and the other fields stay as they were", async () => {
    const token = githubToken();
    const response = { stdout: `remote: ok\nGH_TOKEN=${token}\ndone`, stderr: "", runs: [{ note: `using ${token}` }], code: 0 };
    const scrubbed = await scrub(stringsIn(response), BUNDLE);
    if (scrubbed.type !== "redacted") throw new Error(`the output came back ${scrubbed.type}`);
    const out = withStrings(response, scrubbed.texts);
    expect(JSON.stringify(out)).not.toContain(token);
    expect(out).toEqual({
      stdout: "remote: ok\nGH_TOKEN=[redacted: github-pat]\ndone",
      stderr: "",
      runs: [{ note: "using [redacted: github-pat]" }],
      code: 0,
    });
  });

  test("an npm token hidden in base64 is redacted, though its text never appears literally", async () => {
    const token = npmToken();
    const encoded = Buffer.from(`//registry.npmjs.org/:_authToken=${token}`).toString("base64");
    const scrubbed = await scrub([`auth ${encoded} end`], BUNDLE);
    if (scrubbed.type !== "redacted") throw new Error(`the output came back ${scrubbed.type}`);
    expect(scrubbed.texts.join("")).not.toContain(encoded);
    expect(scrubbed.texts[0]).toStartWith("auth [redacted: ");
    expect(scrubbed.texts[0]).toEndWith("] end");
  });

  test("a WireGuard key read with line numbers in front of it is still found, because the file it came from is scanned", async () => {
    const key = wireguardKey();
    const file = wireguardKeyFile(temporary(), key);
    const scrubbed = await scrub([`     1\t${key}`], BUNDLE, file);
    if (scrubbed.type !== "redacted") throw new Error(`the output came back ${scrubbed.type}`);
    expect(scrubbed.texts).toEqual(["     1\t[redacted: wireguard-dot-key-file, wireguard-key-file]"]);
  });

  test("output with no credential in it is left alone rather than rewritten", async () => {
    expect(await scrub(["total 0\ndrwxr-xr-x  2 me me 40 .", "npm_ is a prefix"], BUNDLE)).toEqual({ type: "clean" });
  });
});

describe("a scan that cannot run", () => {
  test("the output is withheld in every field but its shape markers, so a credential is not passed through unscanned", async () => {
    const token = githubToken();
    const was = process.env.HOME;
    process.env.HOME = temporary();
    try {
      const scrubbed = await scrub([`GH_TOKEN=${token}`, "text", "more output, unscanned"], BUNDLE);
      if (scrubbed.type !== "withheld") throw new Error(`the output came back ${scrubbed.type}`);
      expect(scrubbed.texts.join("")).not.toContain(token);
      expect(scrubbed.texts[0]).toMatch(/gitleaks \S+ is not installed/);
      expect(scrubbed.texts[1]).toBe("text");
      expect(scrubbed.texts[2]).toMatch(/gitleaks \S+ is not installed/);
    } finally {
      process.env.HOME = was;
    }
  });
});
