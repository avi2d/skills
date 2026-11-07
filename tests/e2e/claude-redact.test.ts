import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { REDACT } from "../../src/dispatcher/claude-dispatcher";
import { CLAUDE_BUNDLE } from "../../src/generate/bundle";
import { githubToken, wireguardKey, wireguardKeyFile } from "../lib/credentials";
import { lendScanner } from "../lib/gitleaks";
import { CAPPED_TREE_MS, HOOK_TEST_MS, rigFor, type Driven } from "./lib/hook-dispatcher";

const RIG = rigFor(CLAUDE_BUNDLE, "claude-code", "skills-cc-redact-");
afterAll(RIG.remove, { timeout: CAPPED_TREE_MS });
setDefaultTimeout(HOOK_TEST_MS);

async function installed(): Promise<Driven> {
  const driven = await RIG.install(RIG.indexWith());
  await lendScanner(driven.home);
  return driven;
}

describe("the redact hook on Claude Code's PostToolUse", () => {
  test("a token in Bash output comes back as the output Claude Code shows the model, with the token gone", async () => {
    const driven = await installed();
    const token = githubToken();
    const response = { stdout: `GH_TOKEN=${token}\n`, stderr: "", interrupted: false, isImage: false };
    const { reply, log } = await driven.fire(REDACT, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "env" },
      tool_response: response,
    });
    expect(reply?.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
    expect(reply?.hookSpecificOutput?.updatedToolOutput).toEqual({ ...response, stdout: "GH_TOKEN=[redacted: github-pat]\n" });
    expect(JSON.stringify(log)).not.toContain(token);
    expect(log.join("\n")).toContain("redact Bash: github-pat");
  });

  test("a Read of a key file is redacted, because a bare key is one only by the name of the file it is read from", async () => {
    const driven = await installed();
    const key = wireguardKey();
    const file = wireguardKeyFile(RIG.temporary("skills-cc-redact-key-"), key);
    const response = { type: "text", file: { filePath: file, content: key, numLines: 1, startLine: 1, totalLines: 1 } };
    const { reply } = await driven.fire(REDACT, {
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: file },
      tool_response: response,
    });
    expect(JSON.stringify(reply)).not.toContain(key);
    expect(reply?.hookSpecificOutput?.updatedToolOutput).toEqual({
      ...response,
      file: { ...response.file, content: "[redacted: wireguard-dot-key-file, wireguard-key-file]" },
    });
  });

  test("clean output gets no reply, so a parallel hook's redaction is not overwritten with the original", async () => {
    const driven = await installed();
    const { reply } = await driven.fire(REDACT, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_response: { stdout: "README.md\n", stderr: "", interrupted: false, isImage: false },
    });
    expect(reply).toBeUndefined();
  });

  test("without a scanner the output is withheld, rather than passed on unscanned", async () => {
    const driven = await RIG.install(RIG.indexWith());
    const token = githubToken();
    const { reply } = await driven.fire(REDACT, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "env" },
      tool_response: { stdout: `GH_TOKEN=${token}\n`, stderr: "" },
    });
    expect(JSON.stringify(reply)).not.toContain(token);
    expect(reply?.hookSpecificOutput?.updatedToolOutput).toEqual({ stdout: expect.stringContaining("[tool output withheld: "), stderr: "" });
  });

  test("a withheld Read keeps its shape, so Claude Code keeps the rewrite", async () => {
    const driven = await RIG.install(RIG.indexWith());
    const key = wireguardKey();
    const file = wireguardKeyFile(RIG.temporary("skills-cc-redact-withheld-"), key);
    const response = { type: "text", file: { filePath: file, content: key, numLines: 1, startLine: 1, totalLines: 1 } };
    const { reply } = await driven.fire(REDACT, {
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: file },
      tool_response: response,
    });
    expect(JSON.stringify(reply)).not.toContain(key);
    expect(reply?.hookSpecificOutput?.updatedToolOutput).toEqual({
      type: "text",
      file: { ...response.file, filePath: expect.stringContaining("[tool output withheld: "), content: "" },
    });
  });
});
