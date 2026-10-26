import { expect, test } from "bun:test";
import { bridgesOf, changesSince, groupState, keptChoice, measure, renderExplorer, renderReport, sessionChoices, sharesOf, summarize, type IndexedSession } from "../../src/context/context-report";
import { pullsOf, readLog, type Pull } from "../../src/report/dispatch-report";

const sample: IndexedSession = {
  tool: "pi", path: "sample", version: "0.87.1", model: "test", repo: "/repo", profile: "default", at: "2026-09-26T00:00:00Z",
  firstMessage: 27,
  parts: [{ name: "preamble", kind: "system", chars: 50 }],
  requests: [
    { at: "2026-09-26T00:00:01Z", input: 5, cacheRead: 7, cacheWrite: 11, output: 2 },
    { at: "2026-09-26T00:00:02Z", input: 25, cacheRead: 9, cacheWrite: 3, output: 4 },
  ],
};
const report = (sessions: readonly IndexedSession[], pulls: readonly Pull[] = []): string => renderReport(sessions, bridgesOf(sessions), pulls);
const explorer = (sessions: readonly IndexedSession[]): string => renderExplorer(sessions, bridgesOf(sessions));

test("the local report keeps each provider request's separate usage", () => {
  expect(report([sample])).toContain("| 2026-09-26T00:00:01Z | 5 | 7 | 11 | 2 | 23 |");
});

test("a Rule's character share uses the Rules subtotal", () => {
  const first = { ...sample, parts: [
    { name: "rule:first", kind: "rule-current-body", chars: 10 },
    { name: "rule:second", kind: "rule-current-body", chars: 30 },
    ...sample.parts,
  ] };
  expect(report([first])).toContain("rule:first | 10 | 11.1% | 25.0% | current tree");
});

test("the empty report says no sessions were indexed", () => {
  expect(report([])).toContain("No sessions indexed");
});

test("opening total and growth use provider input including caches, not character estimates", () => {
  expect(summarize(sample)).toEqual({ opening: 23, firstMessageChars: 27, growth: 14, requests: 2, output: 6 });
});

test("Rules a session stored are shared out among the Rules as the session stored them", () => {
  const stored = { ...sample, tool: "claude-code" as const, parts: [
    { name: "attachment:hook_additional_context holding first", kind: "rule-carriage", chars: 40 },
    ...sample.parts,
  ] };
  expect(report([stored])).toContain("holding first | 40 | 44.4% | 100.0% | Rules as the session stored them |");
});

test("a Rule's size and a session's Profile come from the tree the report runs in, whatever size the index once stored", () => {
  const { profile: _, ...stored } = { ...sample, parts: [...sample.parts, { name: "rule:first", kind: "rule-current-body", chars: 999 }, { name: "rule:gone", kind: "rule-current-body", chars: 0 }] };
  const [now] = measure([stored], new Map([["first", "abc"]]), [{ name: "small", models: ["test"] }]);
  expect(now?.profile).toBe("small");
  expect(now?.parts.map(({ name, chars }) => ({ name, chars }))).toEqual([{ name: "preamble", chars: 50 }, { name: "rule:first", chars: 3 }]);
  const [later] = measure([stored], new Map([["first", "abcdef"], ["gone", "ab"]]), []);
  expect(later?.profile).toBe("default");
  expect(later?.parts.map(({ name, chars }) => ({ name, chars }))).toEqual([{ name: "preamble", chars: 50 }, { name: "rule:first", chars: 6 }, { name: "rule:gone", chars: 2 }]);
});

test("a change pairs parts by what they are, not by the Rules a carriage held", () => {
  const earlier = { ...sample, parts: [{ name: "attachment:hook_additional_context holding first", kind: "rule-carriage", chars: 40 }, ...sample.parts] };
  const later = { ...sample, parts: [{ name: "attachment:hook_additional_context holding first, second", kind: "rule-carriage", chars: 55 }, ...sample.parts] };
  expect(changesSince(later, earlier)).toEqual([{ name: "attachment:hook_additional_context", chars: 15 }]);
});

test("a change pairs a carriage with itself when other context joins it under the same attachment type", () => {
  const earlier = { ...sample, parts: [{ name: "attachment:hook_additional_context holding first", kind: "rule-carriage", chars: 40 }, ...sample.parts] };
  const later = { ...sample, parts: [
    { name: "attachment:hook_additional_context (Rules) holding first", kind: "rule-carriage", chars: 40 },
    { name: "attachment:hook_additional_context (not Rules)", kind: "attachment", chars: 10 },
    ...sample.parts,
  ] };
  expect(changesSince(later, earlier)).toEqual([{ name: "attachment:hook_additional_context (not Rules)", chars: 10 }]);
});

test("the Claude Code remainder names the system prompt only when no prompt snapshot stored it", () => {
  const snapshot = { name: "attachment:prompt_snapshot", kind: "attachment", chars: 5 };
  expect(report([{ ...sample, tool: "claude-code" }])).toContain("| Provider framing, the system prompt and the built-in tool definitions | unknown |");
  expect(report([{ ...sample, tool: "claude-code", parts: [snapshot] }])).toContain("| Provider framing and the built-in tool definitions | unknown |");
});

test("a preview of the Rules gets no share of the Rules and says what reached the model", () => {
  const previewed = { ...sample, tool: "claude-code" as const, parts: [
    { name: "attachment:hook_additional_context holding a preview of the carriage for first", kind: "rule-carriage-preview", chars: 40 },
    ...sample.parts,
  ] };
  expect(report([previewed])).toContain("preview of the carriage for first | 40 | 44.4% | preview, not Rules | preview stored and shown in place of the Rules, whose text past it never reached the model |");
});

test("each part's share is of the characters still selected, and a part turned off has none", () => {
  expect(sharesOf([10, 30, 60], [true, true, true])).toEqual(["10.0%", "30.0%", "60.0%"]);
  expect(sharesOf([10, 30, 60], [true, true, false])).toEqual(["25.0%", "75.0%", "off"]);
  expect(sharesOf([10, 30], [false, false])).toEqual(["off", "off"]);
});

test("a group of parts reads as all on, all off, or some on, so a group with one part off is not shown as off", () => {
  expect(groupState([true, true])).toBe("all");
  expect(groupState([true, false])).toBe("some");
  expect(groupState([false, false])).toBe("none");
});

test("the explorer names the unmeasured remainder of each session", () => {
  expect(explorer([{ ...sample, tool: "claude-code" }])).toContain('"hidden":"Provider framing, the system prompt and the built-in tool definitions"');
});

const bridgedPi: IndexedSession = { ...sample, path: "pi.jsonl", model: "claude-bridge/claude-opus-5-5" };
const transport: IndexedSession = { ...sample, tool: "claude-code", path: "claude.jsonl", model: "claude-code/claude-opus-5-5", at: "2026-09-26T00:00:01.300Z" };

test("a Claude Code session carrying a claude-bridge pi session's requests is bridged from it", () => {
  expect(bridgesOf([transport, bridgedPi]).get(transport)).toBe(bridgedPi);
  expect(bridgesOf([transport, bridgedPi]).get(bridgedPi)).toBeUndefined();
  expect(bridgesOf([transport, { ...bridgedPi, model: "anthropic/claude-opus-5-5" }]).get(transport)).toBeUndefined();
  expect(bridgesOf([transport, { ...bridgedPi, repo: "/other" }]).get(transport)).toBeUndefined();
  expect(bridgesOf([transport, { ...bridgedPi, requests: sample.requests.map((request) => ({ ...request, output: request.output + 1 })) }]).get(transport)).toBeUndefined();
  expect(bridgesOf([transport, { ...bridgedPi, requests: sample.requests.map((request) => ({ ...request, at: "2026-09-26T00:01:00Z" })) }]).get(transport)).toBeUndefined();
});

test("a transport is bridged from the pi request it starts at, however long pi ran before it and however far pi ran past it", () => {
  const [opening, second] = sample.requests;
  const carried = second ?? expect.unreachable("sample has a second request");
  const longPi: IndexedSession = { ...bridgedPi, at: "2026-09-25T20:00:00Z", requests: [{ ...opening ?? expect.unreachable("sample has a request"), at: "2026-09-25T20:00:05Z" }, { ...carried, at: "2026-09-26T00:00:09Z" }, { ...carried, input: 30, at: "2026-09-26T00:00:20Z" }] };
  const laterTransport: IndexedSession = { ...transport, at: "2026-09-26T00:00:00Z", requests: [{ ...carried, at: "2026-09-26T00:00:02Z" }] };
  expect(bridgesOf([laterTransport, longPi]).get(laterTransport)).toBe(longPi);
});

test("of two pi sessions that stored the same usage, a transport is bridged from the one whose request is nearest in time", () => {
  const twin: IndexedSession = { ...bridgedPi, path: "twin.jsonl", requests: sample.requests.map((request) => ({ ...request, at: `${request.at.slice(0, -1)}.900Z` })) };
  expect(bridgesOf([transport, twin, bridgedPi]).get(transport)).toBe(bridgedPi);
});

test("of two pi sessions that sent the same first request, a transport is bridged from the one holding more of its requests, before time decides", () => {
  const [opening, second] = sample.requests;
  const carried = second ?? expect.unreachable("sample has a second request");
  const nearer: IndexedSession = { ...bridgedPi, path: "nearer.jsonl", requests: [opening ?? expect.unreachable("sample has a request"), { ...carried, input: 99 }] };
  const holder: IndexedSession = { ...bridgedPi, path: "holder.jsonl", requests: sample.requests.map((request) => ({ ...request, at: `${request.at.slice(0, -1)}.900Z` })) };
  expect(bridgesOf([transport, nearer, holder]).get(transport)).toBe(holder);
});

test("changing the harness in the explorer opens that harness's newest session, not the old position", () => {
  const rows = [{ tool: "claude-code", profile: "default" }, { tool: "claude-code", profile: "default" }, { tool: "codex", profile: "default" }, { tool: "codex", profile: "default" }];
  const secondClaude = sessionChoices(rows, "claude-code", "default")[1] ?? expect.unreachable("two claude-code rows");
  const codex = sessionChoices(rows, "codex", "default");
  expect(keptChoice(codex, secondClaude)).toBe(codex[0]);
  expect(keptChoice(sessionChoices(rows, "claude-code", "default"), secondClaude)).toBe(secondClaude);
});

test("a bridged Claude Code session stays listed, marked, and out of Claude Code's comparisons", () => {
  const earlier: IndexedSession = { ...transport, path: "earlier.jsonl", at: "2026-09-25T00:00:00Z", requests: [{ ...sample.requests[0] ?? expect.unreachable("sample has a request"), input: 1 }] };
  const later: IndexedSession = { ...transport, path: "later.jsonl", at: "2026-09-27T00:00:00Z", requests: sample.requests.map((request) => ({ ...request, at: request.at.replace("09-26", "09-27") })) };
  const rendered = report([later, transport, bridgedPi, earlier]);
  expect(rendered).toContain(`| ${transport.at} | claude-code 0.87.1 claude-code/claude-opus-5-5 /repo default, bridged from pi ${bridgedPi.at} |`);
  expect(rendered).toContain("carried the provider requests of the pi session at pi.jsonl on claude-bridge");
  expect(rendered).not.toContain(`Change since ${transport.at}`);
  expect(rendered).toContain(`Change since ${earlier.at}: provider opening 4 exact tokens`);
  expect(explorer([transport, bridgedPi])).toContain(`"bridgedFrom":"${bridgedPi.at}"`);
});

test("every session's summary row sits under its own table header, so a Markdown viewer renders it as a table row", () => {
  const second = { ...sample, path: "second", at: "2026-09-27T00:00:00Z" };
  const lines = report([sample, second]).split("\n");
  const rows = lines.flatMap((line, index) => line.startsWith(`| ${sample.at} |`) || line.startsWith(`| ${second.at} |`) ? [index] : []);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(lines.slice(row - 2, row)).toEqual(["| Date | Tool, version, model, repo, Profile | Opening input tokens | First message chars | Requests | Input growth |", "| --- | --- | ---: | ---: | ---: | ---: |"]);
});

const pulls = (text: string): Pull[] => pullsOf(readLog(text));

const LOG = [
  "2026-09-26T00:00:03Z sample pull unslop: read unslop/SKILL.md",
  "2026-09-26T00:00:04Z sample pull unslop: read unslop/SKILL.md",
  "2026-09-26T00:00:05Z sample pull plain-words: Read plain-words/SKILL.md",
  "2026-09-26T00:00:06Z second pull unslop: read unslop/SKILL.md",
  "2026-09-26T00:00:07Z elsewhere pull unslop: read unslop/SKILL.md",
].join("\n");

test("pulls from the dispatch log are counted by Profile and by model", () => {
  const second: IndexedSession = { ...sample, path: "second", model: "other", at: "2026-09-27T00:00:00Z" };
  const rendered = report([sample, second], pulls(LOG));
  expect(rendered).toContain("| default | unslop | 3 | 2 | 100.0% |");
  expect(rendered).toContain("| default | plain-words | 1 | 1 | 50.0% |");
  expect(rendered).toContain("| test | unslop | 2 | 1 | 100.0% |");
  expect(rendered).toContain("| test | plain-words | 1 | 1 | 100.0% |");
  expect(rendered).toContain("| other | unslop | 1 | 1 | 100.0% |");
  expect(rendered).not.toContain("elsewhere");
});

test("a log with no pulls by an indexed session says so instead of listing Profiles", () => {
  expect(report([sample])).toContain("No indexed session has a pull of a Body's SKILL.md in the dispatch log.");
  expect(report([sample], pulls("2026-09-26T00:00:07Z elsewhere pull unslop: read unslop/SKILL.md"))).toContain(
    "No indexed session has a pull of a Body's SKILL.md in the dispatch log.",
  );
});

test("a bridged Claude Code session is no session of its own in the pull rates, and its pulls count under the pi session it carried", () => {
  const ownPull = report([transport, bridgedPi], pulls("2026-09-26T00:00:03Z pi.jsonl pull unslop: read unslop/SKILL.md"));
  expect(ownPull).toContain("| default | unslop | 1 | 1 | 100.0% |");
  expect(ownPull).toContain("| claude-bridge/claude-opus-5-5 | unslop | 1 | 1 | 100.0% |");
  expect(ownPull).not.toContain(`| ${transport.model} | unslop |`);
  const carriedPull = report([transport, bridgedPi], pulls("2026-09-26T00:00:03Z claude pull unslop: Read unslop/SKILL.md"));
  expect(carriedPull).toContain("| default | unslop | 1 | 1 | 100.0% |");
  expect(carriedPull).toContain("| claude-bridge/claude-opus-5-5 | unslop | 1 | 1 | 100.0% |");
});
