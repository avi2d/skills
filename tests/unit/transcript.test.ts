import { describe, expect, test } from "bun:test";
import { type Action, type Index } from "../../src/dispatcher/dispatch";
import { START } from "../../src/dispatcher/run-state";
import { logLine } from "../../src/dispatcher/dispatch-log";
import { transcriptEntry as claudeEntry, transcriptOf } from "../../src/dispatcher/claude-dispatcher";
import { transcriptEntry as codexEntry } from "../../src/dispatcher/codex-dispatcher";
import { hear, listenFor, recorded, type Place } from "../../src/dispatcher/transcript";
import { carriageFor, injectedState } from "../lib/dispatch";

const INDEX: Index = {
  harness: "claude-code",
  rules: [
    { name: "naming", triggers: [{ predicate: "always" }], text: "# Naming\n\nName every variable after what it holds.\n" },
    { name: "hygiene", triggers: [{ predicate: "always" }], text: "# Hygiene\n\nNever sign a commit as the agent.\n" },
  ],
  profiles: [],
  hub: [],
};

const HOOK_RAN = "2026-09-24T06:00:00.000Z";
const BEFORE = "2026-09-24T05:59:59.000Z";
const AFTER = "2026-09-24T06:00:01.000Z";
const LATER = "2026-09-24T06:00:02.000Z";

const lines = (...entries: unknown[]): string => entries.map((entry) => JSON.stringify(entry)).join("\n");

const said = (at: string, id = `msg_${at}`) => ({
  type: "assistant",
  timestamp: at,
  message: { id, role: "assistant", content: [{ type: "text", text: "ok" }] },
});
const context = (at: string, text: string) => ({
  type: "attachment",
  timestamp: at,
  attachment: { type: "hook_additional_context", content: [text], hookName: "UserPromptSubmit", hookEvent: "UserPromptSubmit" },
});
const denied = (at: string, text: string) => ({
  type: "user",
  timestamp: at,
  toolDenialKind: "permission-rule",
  message: { role: "user", content: [{ type: "tool_result", content: text, is_error: true, tool_use_id: "toolu_1" }] },
});

const place = (...rules: string[]): Place => ({ transcript: "/t.jsonl", at: HOOK_RAN, rules });

describe("what a Claude Code transcript says the hooks put in front of the model", () => {
  test("the context a prompt hook added is carried, and so is a denial's reason", () => {
    expect(claudeEntry(context(AFTER, "rules"))).toEqual({ at: AFTER, carried: ["rules"] });
    expect(claudeEntry(denied(AFTER, "a rule"))).toEqual({ at: AFTER, carried: ["a rule"] });
  });

  test("the model's own entry is an answer from the message it is part of, and carries nothing", () => {
    expect(claudeEntry(said(AFTER, "msg_1"))).toEqual({ at: AFTER, carried: [], answer: { message: "msg_1" } });
  });

  test("a prompt or a tool's output holding a Rule's words is not the hook delivering it", () => {
    const prompt = { type: "user", timestamp: AFTER, message: { role: "user", content: [{ type: "text", text: "rules" }] } };
    const printed = {
      type: "user",
      timestamp: AFTER,
      message: { role: "user", content: [{ type: "tool_result", content: "rules", is_error: false, tool_use_id: "toolu_2" }] },
    };
    expect(claudeEntry(prompt)).toBeUndefined();
    expect(claudeEntry(printed)).toBeUndefined();
  });

  test("an entry with no time on it says nothing, since it cannot be placed after the hook", () => {
    expect(claudeEntry({ type: "assistant" })).toBeUndefined();
    expect(claudeEntry("not an entry")).toBeUndefined();
  });

  test("a sub-agent's denial is looked for in the transcript Claude Code keeps for that sub-agent", () => {
    const main = "/p/-work/abc.jsonl";
    expect(transcriptOf({ transcript_path: main })).toBe(main);
    expect(transcriptOf({ transcript_path: main, agent_id: "a1" })).toBe("/p/-work/abc/subagents/agent-a1.jsonl");
    expect(transcriptOf({})).toBeUndefined();
  });
});

describe("what a Codex rollout says the hooks put in front of the model", () => {
  const item = (payload: unknown) => ({ timestamp: AFTER, type: "response_item", payload });

  test("hook context is the content Codex marks as the hook's, and nothing else in the same message", () => {
    const message = item({
      type: "message",
      role: "developer",
      content: [
        { type: "input_text", text: "permissions" },
        { type: "input_text", text: "rules" },
      ],
      internal_chat_message_metadata_passthrough: { content_item_kinds: ["permissions.instructions", "hooks.additional_context"] },
    });
    expect(codexEntry(message)).toEqual({ at: AFTER, carried: ["rules"], fedBack: true });
  });

  test("instructions Codex adds itself are not the hook's", () => {
    const agents = item({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "rules" }],
      internal_chat_message_metadata_passthrough: { content_item_kinds: ["agents_md.instructions"] },
    });
    expect(codexEntry(agents)).toBeUndefined();
  });

  test("a blocked call's output carries the reason, and an ordinary output is fed back carrying nothing", () => {
    const blocked = item({ type: "function_call_output", call_id: "c1", output: "Command blocked by PreToolUse hook: rules. Command: git push" });
    const patched = item({ type: "custom_tool_call_output", call_id: "c2", output: [{ type: "input_text", text: "Tool call blocked by PreToolUse hook: rules. Tool: x" }] });
    const ordinary = item({ type: "function_call_output", call_id: "c3", output: "rules" });
    expect(codexEntry(blocked)?.carried).toEqual(["Command blocked by PreToolUse hook: rules. Command: git push"]);
    expect(codexEntry(patched)?.carried).toEqual(["Tool call blocked by PreToolUse hook: rules. Tool: x"]);
    expect(codexEntry(ordinary)).toEqual({ at: AFTER, carried: [], fedBack: true });
  });

  test("what the model produced is an answer once something was fed back to it", () => {
    expect(codexEntry(item({ type: "message", role: "assistant", content: [] }))?.answer).toBe("once-fed-back");
    expect(codexEntry(item({ type: "function_call", name: "shell", arguments: "{}", call_id: "c1" }))?.answer).toBe("once-fed-back");
    expect(codexEntry(item({ type: "reasoning", summary: [] }))?.answer).toBe("once-fed-back");
  });

  test("a line that is not a response item says nothing", () => {
    expect(codexEntry({ timestamp: AFTER, type: "event_msg", payload: { type: "task_started" } })).toBeUndefined();
  });
});

describe("reading a transcript from the moment a hook ran", () => {
  test("only what was written after the hook counts, so an earlier delivery cannot stand in for this one", () => {
    const text = lines(context(BEFORE, "old"), said(BEFORE), context(AFTER, "new"));
    expect(recorded(text, HOOK_RAN, claudeEntry)).toEqual({ answered: false, carrying: "new" });
  });

  test("the model answering after the hook is what says the record has caught up", () => {
    expect(recorded(lines(said(AFTER)), HOOK_RAN, claudeEntry).answered).toBe(true);
  });

  test("a line the harness was still writing is passed over rather than failing the read", () => {
    const text = `${lines(context(AFTER, "new"))}\n{"type":"assis`;
    expect(recorded(text, HOOK_RAN, claudeEntry).carrying).toBe("new");
  });
});

describe("hearing back what a hook said", () => {
  const whole = carriageFor(INDEX, ["naming"]);
  const reading =
    (text: string) =>
    (): string =>
      text;
  const broken = (actions: readonly Action[]) => actions.filter((a) => a.type === "broken").map((a) => a.rule);

  test("a Rule the transcript holds, with the model answering after it, is checked and nothing is said", () => {
    const heard = hear(INDEX, injectedState("naming"), [place("naming")], reading(lines(context(AFTER, whole), said(AFTER))), claudeEntry, false);
    expect(heard.actions).toEqual([]);
    expect(heard.state.rules).toEqual({ naming: { state: "checked" } });
    expect(heard.awaiting).toEqual([]);
  });

  test("a reply the harness never recorded is reported as never arriving", () => {
    const heard = hear(INDEX, injectedState("naming"), [place("naming")], reading(lines(said(AFTER))), claudeEntry, false);
    expect(heard.actions.map(logLine)).toEqual([
      "broken naming: it was injected, and the transcript that followed recorded no trace of it, so it never reached the model",
    ]);
  });

  test("a Claude Code tool call streamed beside the hooked one is not the model answering the refusal", () => {
    const refusal = carriageFor(INDEX, ["naming"]);
    const sibling = lines(said(BEFORE, "msg_1"), said(AFTER, "msg_1"));
    const early = hear(INDEX, injectedState("naming"), [place("naming")], reading(sibling), claudeEntry, false);
    expect(early.actions).toEqual([]);
    expect(early.awaiting).toEqual([place("naming")]);
    const caught = lines(said(BEFORE, "msg_1"), said(AFTER, "msg_1"), denied(LATER, refusal), said(LATER, "msg_2"));
    const later = hear(INDEX, injectedState("naming"), [place("naming")], reading(caught), claudeEntry, false);
    expect(later.actions).toEqual([]);
    expect(later.state.rules).toEqual({ naming: { state: "checked" } });
  });

  test("a Codex tool call recorded beside the hooked one is not the model answering the refusal", () => {
    const at = (timestamp: string, payload: unknown) => ({ timestamp, type: "response_item", payload });
    const call = (timestamp: string, id: string) => at(timestamp, { type: "function_call", name: "shell", arguments: "{}", call_id: id });
    const blocked = at(LATER, { type: "function_call_output", call_id: "c1", output: `Command blocked by PreToolUse hook: ${carriageFor(INDEX, ["naming"])}` });
    const answer = at(LATER, { type: "message", role: "assistant", content: [] });
    const early = hear(INDEX, injectedState("naming"), [place("naming")], reading(lines(call(BEFORE, "c1"), call(AFTER, "c2"))), codexEntry, false);
    expect(early.actions).toEqual([]);
    expect(early.awaiting).toEqual([place("naming")]);
    const caught = lines(call(BEFORE, "c1"), call(AFTER, "c2"), blocked, answer);
    const later = hear(INDEX, injectedState("naming"), [place("naming")], reading(caught), codexEntry, false);
    expect(later.actions).toEqual([]);
    expect(later.state.rules).toEqual({ naming: { state: "checked" } });
  });

  test("a transcript that has not caught up yet is asked again later, rather than read as a loss", () => {
    const heard = hear(INDEX, injectedState("naming"), [place("naming")], reading(lines(context(BEFORE, whole))), claudeEntry, false);
    expect(heard.actions).toEqual([]);
    expect(heard.state.rules).toEqual({ naming: { state: "injected" } });
    expect(heard.awaiting).toEqual([place("naming")]);
  });

  test("the last hook of a session reads what is there, since nothing will be written after it", () => {
    const heard = hear(INDEX, injectedState("naming"), [place("naming")], reading(""), claudeEntry, true);
    expect(broken(heard.actions)).toEqual(["naming"]);
  });

  test("each place answers for its own Rules, so one hook's lost reply is not blamed on another's", () => {
    const both = injectedState("naming", "hygiene");
    const records: Record<string, string> = {
      "/prompt.jsonl": lines(context(AFTER, whole), said(AFTER)),
      "/agent.jsonl": lines(said(AFTER)),
    };
    const heard = hear(
      INDEX,
      both,
      [
        { transcript: "/prompt.jsonl", at: HOOK_RAN, rules: ["naming"] },
        { transcript: "/agent.jsonl", at: HOOK_RAN, rules: ["hygiene"] },
      ],
      (path) => records[path],
      claudeEntry,
      false,
    );
    expect(broken(heard.actions)).toEqual(["hygiene"]);
  });

  test("a transcript the harness has not created yet is waited on", () => {
    const heard = hear(INDEX, injectedState("naming"), [place("naming")], () => undefined, claudeEntry, false);
    expect(heard.awaiting).toEqual([place("naming")]);
    expect(heard.notes).toEqual([]);
  });

  test("a transcript still missing when the session ends is said so, rather than read as a loss", () => {
    const heard = hear(INDEX, injectedState("naming"), [place("naming")], () => undefined, claudeEntry, true);
    expect(heard.actions).toEqual([]);
    expect(heard.notes).toEqual(["broken dispatcher: /t.jsonl was never written, so whether naming arrived was not checked"]);
  });

  test("a transcript that cannot be read is said so, and its Rules are not reported as lost", () => {
    const heard = hear(
      INDEX,
      injectedState("naming"),
      [place("naming")],
      () => {
        throw new Error("ENOENT");
      },
      claudeEntry,
      false,
    );
    expect(heard.actions).toEqual([]);
    expect(heard.awaiting).toEqual([]);
    expect(heard.notes).toEqual(["broken dispatcher: /t.jsonl could not be read (ENOENT), so whether naming arrived was not checked"]);
  });
});

describe("remembering where to listen", () => {
  const inject = (rule: string): Action => ({ type: "inject", rule, why: "always", text: "" });
  const deliver = (rule: string): Action => ({ type: "deliver", rule, why: "tool-call", text: "" });

  test("what a hook sent is awaited in the transcript it will be written to, from the moment it ran", () => {
    const listening = listenFor([], injectedState("naming", "hygiene"), [inject("naming"), deliver("hygiene")], "/t.jsonl", HOOK_RAN);
    expect(listening.awaiting).toEqual([place("naming", "hygiene")]);
    expect(listening.notes).toEqual([]);
  });

  test("a hook that sent nothing adds nothing to wait for", () => {
    expect(listenFor([], START, [], "/t.jsonl", HOOK_RAN)).toEqual({ awaiting: [], notes: [] });
  });

  test("a harness that names no transcript is said so, rather than trusted", () => {
    const listening = listenFor([], injectedState("naming"), [inject("naming")], undefined, HOOK_RAN);
    expect(listening.awaiting).toEqual([]);
    expect(listening.notes).toEqual(["broken dispatcher: naming went out, and the harness named no transcript to check their arrival against"]);
  });

  test("a Rule put back in question before its record caught up is dropped, and the drop is said", () => {
    const listening = listenFor([place("naming")], START, [], "/t.jsonl", AFTER);
    expect(listening.awaiting).toEqual([]);
    expect(listening.notes).toEqual([
      "broken dispatcher: whether naming arrived was never checked, because they were put back in question before /t.jsonl recorded an answer",
    ]);
  });
});
