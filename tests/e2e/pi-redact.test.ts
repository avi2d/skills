import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Index } from "../../src/dispatcher/dispatch";
import { githubToken, wireguardKey, wireguardKeyFile } from "../lib/credentials";
import { installedScanner } from "../lib/gitleaks";
import { closeSessions, load } from "../lib/pi";

beforeAll(installedScanner);
afterAll(closeSessions);

// Each scan spawns gitleaks, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(60_000);

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const EMPTY: Index = { harness: "pi", rules: [], profiles: [], hub: [] };

const logOf = (home: string): string => readFileSync(join(home, "state", "skills", "dispatch.log"), "utf8");

describe("the pi extension's tool_result handler", () => {
  test("a token in bash output is replaced in the content, the details and the structured content alike", async () => {
    const dispatcher = await load(EMPTY);
    const token = githubToken();
    const output = `GH_TOKEN=${token}\n`;
    const result = await dispatcher.result("bash", { command: "env" }, false, {
      content: [{ type: "text", text: output }],
      details: { truncation: undefined, fullOutputPath: undefined, last: output },
      structuredContent: { exit_code: 0, output, truncated: false },
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result).toEqual({
      content: [{ type: "text", text: "GH_TOKEN=[redacted: github-pat]\n" }],
      details: { truncation: undefined, fullOutputPath: undefined, last: "GH_TOKEN=[redacted: github-pat]\n" },
      structuredContent: { exit_code: 0, output: "GH_TOKEN=[redacted: github-pat]\n", truncated: false },
    });
    expect(logOf(dispatcher.home)).toContain("redact bash: github-pat");
    expect(logOf(dispatcher.home)).not.toContain(token);
  });

  test("a read of a key file is redacted, because a bare key is one only by the name of the file it is read from", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skills-pi-redact-"));
    roots.push(dir);
    const key = wireguardKey();
    const file = wireguardKeyFile(dir, key);
    const dispatcher = await load(EMPTY, { cwd: dir });
    const result = await dispatcher.result("read", { path: file }, false, { content: [{ type: "text", text: `${key}\n` }] });
    expect(result).toEqual({ content: [{ type: "text", text: "[redacted: wireguard-dot-key-file, wireguard-key-file]\n" }], details: undefined });
  });

  test("clean output is left as pi produced it, with nothing returned to replace it", async () => {
    const dispatcher = await load(EMPTY);
    const result = await dispatcher.result("bash", { command: "ls" }, false, {
      content: [{ type: "text", text: "README.md\n" }],
      structuredContent: { exit_code: 0, output: "README.md\n", truncated: false },
    });
    expect(result).toBeUndefined();
  });

  test("an image beside the text is passed through as it was", async () => {
    const dispatcher = await load(EMPTY);
    const token = githubToken();
    const image = { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" };
    const result = await dispatcher.result("read", { path: "shot.png" }, false, {
      content: [{ type: "text", text: `caption ${token}` }, image],
    });
    expect(result).toEqual({ content: [{ type: "text", text: "caption [redacted: github-pat]" }, image], details: undefined });
  });
});
