import { describe, expect, it } from "bun:test";
import { parseSession } from "../../src/context/context-reader";
import { isSession, openingParts, readBefore, stateDir } from "../../src/context/context-index";
import { READER_VERSION } from "../../src/context/context-reader";
import { readLog } from "../../src/report/dispatch-report";
import { saidBy, valueOf } from "../lib/effect";

const pi = [
  JSON.stringify({ type: "session", version: 3, cwd: "/repo", id: "one", timestamp: "2026-09-26T00:00:00Z" }),
  JSON.stringify({ type: "model_change", provider: "openai", modelId: "test" }),
  JSON.stringify({ type: "message", message: { role: "system", sections: { preamble: "hello" }, toolsAdded: [{ name: "read", description: "reads" }] } }),
  JSON.stringify({ type: "message", timestamp: "2026-09-26T00:00:01Z", message: { role: "assistant", usage: { input: 5, cacheRead: 7, cacheWrite: 11, output: 2 } } }),
].join("\n");

const lines = (records: readonly object[]): string => records.map((record) => JSON.stringify(record)).join("\n");
const carriage = "The following rules are in force for this session. Follow them.\n\n# First";
const claudeRequest = { type: "assistant", version: "2.0", cwd: "/repo", timestamp: "2026-09-26T00:00:01Z", requestId: "r1", message: { role: "assistant", model: "test", usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 } } };
const claude = lines([
  { type: "user", version: "1.0", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", message: { role: "user", content: "hello" } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "hook_additional_context", content: [carriage], hookName: "UserPromptSubmit" } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "instructions", files: [{ path: "/repo/AGENTS.md", type: "Project", content: "abc" }] } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "skill_listing", content: "- one", skillCount: 1 } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "hook_success", content: "one", hookEvent: "SessionStart" } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "hook_success", content: "two", hookEvent: "SessionStart" } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "prompt_snapshot", systemPrompt: ["ab", "cd"] } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "model", identity: { modelId: "test" }, text: "You are test" } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "date", date: "2026-09-26" } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "total_tokens_reminder", text: "<total_tokens>9</total_tokens>" } },
  { type: "attachment", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "mcp_instructions_delta", addedNames: ["srv"], addedBlocks: ["one", "two"], removedNames: [] } },
  claudeRequest,
]);
const codexOpening = [
  { type: "session_meta", timestamp: "2026-09-09T00:00:00Z", payload: { cwd: "/repo", cli_version: "0.1", model_provider: "openai", base_instructions: { text: "start" } } },
  { type: "response_item", timestamp: "2026-09-09T00:00:00Z", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>here</environment_context>" }, { type: "input_text", text: carriage }], internal_chat_message_metadata_passthrough: { content_item_kinds: ["environments.environment_context", "hooks.additional_context"] } } },
  { type: "turn_context", timestamp: "2026-09-09T00:00:00Z", payload: { model: "gpt-test" } },
  { type: "response_item", timestamp: "2026-09-09T00:00:00Z", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "ask" }], internal_chat_message_metadata_passthrough: { content_item_kinds: ["user.text"] } } },
];
const tokens = (last: number, total: number) => ({ type: "event_msg", timestamp: `2026-09-09T00:00:0${total}Z`, payload: { type: "token_count", info: { total_token_usage: { input_tokens: total, cached_input_tokens: 0, output_tokens: 1 }, last_token_usage: { input_tokens: last, cached_input_tokens: 0, output_tokens: 1 } } } });

describe("stored sessions", () => {
  it("reads provider usage without turning character sizes into tokens", async () => {
    const session = await valueOf(parseSession("pi", "session.jsonl", pi));
    expect(session.requests).toEqual([{ at: "2026-09-26T00:00:01Z", input: 5, cacheRead: 7, cacheWrite: 11, output: 2 }]);
    expect(session.parts).toEqual([
      { name: "preamble", kind: "system", chars: 5 },
      { name: "tool:read", kind: "tool", chars: 5 },
    ]);
  });

  it("counts no pi provider call that failed before it read any input as a request", async () => {
    const failed = JSON.stringify({ type: "message", timestamp: "2026-09-26T00:00:00Z", message: { role: "assistant", stopReason: "error", errorMessage: "API error (504)", usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } } });
    const [header, model, system, answered] = pi.split("\n");
    const session = await valueOf(parseSession("pi", "session.jsonl", [header, model, system, failed, answered].join("\n")));
    expect(session.requests).toEqual([{ at: "2026-09-26T00:00:01Z", input: 5, cacheRead: 7, cacheWrite: 11, output: 2 }]);
  });

  it("keeps the Claude working directory of the opening request when the session is resumed from another", async () => {
    const resumed = lines([{ type: "user", version: "2.0", cwd: "/other", timestamp: "2026-09-26T01:00:00Z", message: { role: "user", content: "again" } }, { ...claudeRequest, cwd: "/other", requestId: "r2" }]);
    expect((await valueOf(parseSession("claude-code", "session.jsonl", `${claude}\n${resumed}`))).repo).toBe("/repo");
  });

  it("uses the Claude version on the first provider request, not an earlier imported message", async () => {
    expect((await valueOf(parseSession("claude-code", "session.jsonl", claude))).version).toBe("2.0");
  });

  it("names each model the way its Dispatcher reports it to a Profile", async () => {
    expect((await valueOf(parseSession("pi", "session.jsonl", pi))).model).toBe("openai/test");
    expect((await valueOf(parseSession("claude-code", "session.jsonl", claude))).model).toBe("claude-code/test");
    expect((await valueOf(parseSession("codex", "rollout.jsonl", lines(codexOpening)))).model).toBe("openai/gpt-test");
  });

  it("keeps the opening attachments a Claude transcript stores", async () => {
    const session = await valueOf(parseSession("claude-code", "session.jsonl", claude));
    expect(session.parts.map(({ name, kind, chars }) => ({ name, kind, chars }))).toEqual([
      { name: "attachment:hook_additional_context", kind: "rule-carriage", chars: carriage.length },
      { name: "attachment:instructions", kind: "attachment", chars: 3 },
      { name: "attachment:skill_listing", kind: "attachment", chars: 5 },
      { name: "attachment:hook_success", kind: "attachment", chars: 6 },
      { name: "attachment:prompt_snapshot", kind: "attachment", chars: 5 },
      { name: "attachment:model", kind: "attachment", chars: 12 },
      { name: "attachment:date", kind: "attachment", chars: 10 },
      { name: "attachment:total_tokens_reminder", kind: "attachment", chars: 30 },
      { name: "attachment:mcp_instructions_delta", kind: "attachment", chars: 7 },
    ]);
  });

  it("sizes each Claude attachment from the text the transcript records as shown to the model", async () => {
    const shown = (text: string) => [{ content: `<system-reminder>\n${text}\n</system-reminder>` }];
    const environment = shown("# Environment\nYou have been invoked in the following environment: \n - Primary working directory: /repo");
    const context = shown("As you answer the user's questions, you can use the following context:\n# userEmail\nThe user's email address is someone@example.com.");
    const rules = shown(`UserPromptSubmit hook additional context: ${carriage}`);
    const queued = "<system-reminder>\nThe user sent a new message while you were working:\nnext\n</system-reminder>";
    const autoMode = shown("While bypass permissions mode is active: work through the Bash tool when it is simpler.");
    const text = lines([
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "environment", snapshot: { workingDirectory: "/repo", isWorktree: false } }, rendered: environment },
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "session_context", context: { userEmail: "The user's email address is someone@example.com." } }, rendered: context },
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "hook_additional_context", content: [carriage] }, rendered: rules },
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "environment", snapshot: { workingDirectory: "/elsewhere" } } },
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "auto_mode", bypass: true }, rendered: autoMode },
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "credential_org", organizationUuid: "org" } },
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "queued_command", prompt: "next" }, rendered: [{ content: [{ type: "text", text: queued }] }] },
      claudeRequest,
    ]);
    const session = await valueOf(parseSession("claude-code", "session.jsonl", text));
    const size = (blocks: ReadonlyArray<{ content: string }>): number => blocks.map((block) => block.content).join("\n").length;
    expect(session.parts.map(({ name, kind, chars }) => ({ name, kind, chars }))).toEqual([
      { name: "attachment:environment", kind: "attachment", chars: size(environment) },
      { name: "attachment:session_context", kind: "attachment", chars: size(context) },
      { name: "attachment:hook_additional_context", kind: "rule-carriage", chars: size(rules) },
      { name: "attachment:auto_mode", kind: "attachment", chars: size(autoMode) },
      { name: "attachment:queued_command", kind: "attachment", chars: queued.length },
    ]);
  });

  it("sizes stored Rules once and takes only their names from the log", async () => {
    const session = await valueOf(parseSession("claude-code", "session.jsonl", claude));
    const log = readLog("2026-09-26T00:00:00Z session inject first: always");
    const parts = openingParts(session, log);
    expect(parts.filter((part) => part.kind.startsWith("rule")).map(({ name, chars }) => ({ name, chars }))).toEqual([
      { name: "attachment:hook_additional_context holding first", chars: carriage.length },
    ]);
  });

  it("sizes a carriage Claude Code stored as a persisted preview as that preview, with no Rule body on top", async () => {
    const preview = `<persisted-output>\nOutput too large (13.3KB). Full output saved to: /tmp/hook.txt\n\nPreview (first 2KB):\n${carriage}\n...\n</persisted-output>`;
    const text = lines([
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "hook_additional_context", content: [preview] } },
      claudeRequest,
    ]);
    const session = await valueOf(parseSession("claude-code", "session.jsonl", text));
    const parts = openingParts(session, readLog("2026-09-26T00:00:00Z session inject first: always"));
    expect(parts.map(({ name, kind, chars }) => ({ name, kind, chars }))).toEqual([
      { name: "attachment:hook_additional_context holding a preview of the carriage for first", kind: "rule-carriage-preview", chars: preview.length },
    ]);
  });

  it("keeps other hook context, a preview of Rules and full Rules of one attachment type as separate parts, each of its own kind", async () => {
    const preview = `<persisted-output>\nOutput too large (13.3KB).\n\nPreview (first 2KB):\n${carriage}\n</persisted-output>`;
    const other = "context another hook added";
    const text = lines([
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "hook_additional_context", content: [other] } },
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "hook_additional_context", content: [preview] } },
      { type: "attachment", cwd: "/repo", timestamp: "2026-09-26T00:00:00Z", attachment: { type: "hook_additional_context", content: [carriage] } },
      claudeRequest,
    ]);
    const session = await valueOf(parseSession("claude-code", "session.jsonl", text));
    expect(session.parts.map(({ name, kind, chars }) => ({ name, kind, chars }))).toEqual([
      { name: "attachment:hook_additional_context (not Rules)", kind: "attachment", chars: other.length },
      { name: "attachment:hook_additional_context (preview of Rules)", kind: "rule-carriage-preview", chars: preview.length },
      { name: "attachment:hook_additional_context (Rules)", kind: "rule-carriage", chars: carriage.length },
    ]);
  });

  it("separates the Codex prompt from the context it injects before it", async () => {
    const session = await valueOf(parseSession("codex", "rollout.jsonl", lines(codexOpening)));
    expect(session.firstMessage).toBe(3);
    expect(session.parts.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "base instructions", kind: "system" },
      { name: "context:environments.environment_context", kind: "context" },
      { name: "context:hooks.additional_context", kind: "rule-carriage" },
    ]);
  });

  it("names Codex opening parts by what they are, whether or not the rollout tags them", async () => {
    const untagged = lines([
      codexOpening[0] ?? expect.unreachable("the fixture opens with session metadata"),
      { type: "response_item", timestamp: "2026-09-09T00:00:00Z", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "<app-context>app</app-context>" }, { type: "input_text", text: "You are root" }] } },
      { type: "response_item", timestamp: "2026-09-09T00:00:00Z", payload: { type: "reasoning", content: null, summary: [] } },
      { type: "response_item", timestamp: "2026-09-09T00:00:00Z", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>here</environment_context>" }, { type: "input_text", text: "ask" }] } },
      tokens(10, 1),
    ]);
    const session = await valueOf(parseSession("codex", "rollout.jsonl", untagged));
    expect(session.firstMessage).toBe(3);
    expect(session.parts.map((part) => part.name)).toEqual(["base instructions", "developer:app-context", "developer:untagged", "context:environments.environment_context"]);
  });

  it("counts Codex cached input once and a repeated cumulative total once", async () => {
    const cached = { ...tokens(100, 1), payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 30, output_tokens: 2 }, last_token_usage: { input_tokens: 100, cached_input_tokens: 30, output_tokens: 2 } } } };
    const once = await valueOf(parseSession("codex", "rollout.jsonl", lines([...codexOpening, cached])));
    expect(once.requests).toEqual([{ at: "2026-09-09T00:00:01Z", input: 70, cacheRead: 30, cacheWrite: 0, output: 2 }]);
    const repeated = await valueOf(parseSession("codex", "rollout.jsonl", lines([...codexOpening, tokens(10, 1), tokens(10, 1), tokens(5, 2)])));
    expect(repeated.requests.map((request) => request.input)).toEqual([10, 5]);
  });

  it("counts a Claude request id the transcript repeats as one request with one token total", async () => {
    const repeated = lines([{ ...claudeRequest }, { ...claudeRequest, timestamp: "2026-09-26T00:00:02Z" }]);
    const session = await valueOf(parseSession("claude-code", "session.jsonl", repeated));
    expect(session.requests).toHaveLength(1);
    expect(session.requests.reduce((sum, request) => sum + request.input + request.cacheRead + request.cacheWrite, 0)).toBe(6);
  });

  it("joins only Rules injected before the first provider request when the session does not store them", async () => {
    const session = await valueOf(parseSession("pi", "session.jsonl", pi));
    const log = readLog([
      "2026-09-26T00:00:00Z session.jsonl inject first: always",
      "2026-09-26T00:00:02Z session.jsonl inject second: later",
    ].join("\n"));
    const parts = openingParts(session, log);
    expect(parts.map((part) => part.name)).toEqual(["preamble", "tool:read", "rule:first"]);
    expect(parts.at(-1)).toEqual({ name: "rule:first", kind: "rule-current-body", chars: 0 });
  });

  it("reads a session with no request without inventing a provider measurement", async () => {
    const session = await valueOf(parseSession("pi", "session.jsonl", pi.split("\n").slice(0, 3).join("\n")));
    expect(session.requests).toEqual([]);
    expect(session.parts.map((part) => part.name)).toContain("preamble");
  });

  it("reads a Claude file that never sent a provider request as having none rather than as unreadable", async () => {
    const stub = lines([
      { type: "mode", mode: "default", sessionId: "one" },
      { type: "permission-mode", permissionMode: "default", sessionId: "one" },
      { type: "system", subtype: "local_command", timestamp: "2026-09-26T00:00:00Z" },
      { type: "last-prompt", lastPrompt: "hello", sessionId: "one" },
    ]);
    expect((await valueOf(parseSession("claude-code", "session.jsonl", stub))).requests).toEqual([]);
  });

  it("re-reads a file an older reader indexed even when the file is unchanged", () => {
    const row = { path: "one.jsonl", file_size: 10, modified: "2026-09-26T00:00:00.000Z", reader: READER_VERSION };
    expect(readBefore(row, 10, row.modified)).toBe(true);
    expect(readBefore({ ...row, reader: READER_VERSION - 1 }, 10, row.modified)).toBe(false);
    expect(readBefore(row, 11, row.modified)).toBe(false);
  });

  it("keeps the index and reads the Dispatcher log in the state directory the Dispatchers write to", () => {
    expect(stateDir({ HOME: "/home/one", XDG_STATE_HOME: "/state" })).toBe("/state/skills");
    expect(stateDir({ HOME: "/home/one" })).toBe("/home/one/.local/state/skills");
  });

  it("indexes no Claude subagent transcript as a session of its own", () => {
    expect(isSession("claude-code", "project/one.jsonl")).toBe(true);
    expect(isSession("claude-code", "project/one/subagents/agent-a1.jsonl")).toBe(false);
  });

  it("refuses broken records with the tool and version", async () => {
    expect(await saidBy(parseSession("pi", "session.jsonl", `${pi}\n{"type":"message","message":{}}`))).toContain("pi unknown (session format 3)");
  });
});
