import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Schema } from "effect";
import { skipReason } from "@avi2dg/checks/scripts/test-skips.ts";
import { CLAUDE_BUNDLE, INDEX, bundle } from "../../src/generate/bundle";
import { CONTEXT_LIMIT } from "../../src/dispatcher/claude-dispatcher";
import type { Index } from "../../src/dispatcher/dispatch";
import { carriageFor } from "../lib/dispatch";
import { valueOf } from "../lib/effect";

const repo = new URL("../../", import.meta.url).pathname;

const claude = Bun.which("claude");
if (!claude) console.warn("[claude-code-delivery] claude is not installed - whether Claude Code receives the Rules whole goes unverified");

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const long = (name: string) => ({
  name,
  triggers: [{ predicate: "always" as const }],
  text: `# ${name}\n\n${`Every ${name} sentence is a sentence the model has to read. `.repeat(80)}`,
});

const INDEXED: Index = {
  harness: "claude-code",
  rules: [long("alpha"), long("beta"), long("gamma")],
  profiles: [],
  hub: [],
};

const Hook = Schema.Struct({ type: Schema.optionalKey(Schema.String), command: Schema.optionalKey(Schema.String), timeout: Schema.optionalKey(Schema.Finite) });
const Hooks = Schema.Record(Schema.String, Schema.Array(Schema.Struct({ matcher: Schema.optionalKey(Schema.String), hooks: Schema.Array(Hook) })));
type Hooks = typeof Hooks.Type;
const decodeSettings = Schema.decodeUnknownSync(Schema.Struct({ hooks: Hooks }));
const decodeRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      messages: Schema.Array(
        Schema.Struct({ content: Schema.Union([Schema.String, Schema.Array(Schema.Struct({ text: Schema.optionalKey(Schema.String) }))]) }),
      ),
    }),
  ),
);
const isHookContext = Schema.is(
  Schema.Struct({
    attachment: Schema.Struct({ type: Schema.Literal("hook_additional_context"), content: Schema.optionalKey(Schema.Array(Schema.String)) }),
  }),
);

const SCRIPTS = {
  "unnamed.ts": `const payload = JSON.parse(await Bun.stdin.text());\ndelete payload.prompt_id;\nprocess.stdout.write(JSON.stringify(payload));\n`,
  "sized.ts": `const size = Number(process.argv[2]);\nconst additionalContext = \`\${process.argv[3]} \`.repeat(size).slice(0, size);\nprocess.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } }));\n`,
};

type Made = { shipped: Hooks; script: (name: keyof typeof SCRIPTS) => string };

function dispatcherHooks(dir: string): Hooks {
  const settings = decodeSettings(JSON.parse(readFileSync(join(repo, "harness/claude-code/settings.json"), "utf8")));
  return Object.fromEntries(
    Object.entries(settings.hooks).map(([event, entries]) => [
      event,
      entries
        .filter((entry) => entry.hooks.some((hook) => hook.command?.includes("skills-dispatch")))
        .map((entry) => ({
          ...entry,
          hooks: entry.hooks.map((hook) =>
            hook.command === undefined ? hook : { ...hook, command: hook.command.replace("$HOME/.claude/skills-dispatch", dir) }),
        })),
    ]),
  );
}

const flat = (text: string): string => text.replace(/[^a-zA-Z0-9]+/g, "");

const textOf = (body: string): string => {
  const { messages } = decodeRequest(body);
  return messages.map(({ content }) => (typeof content === "string" ? content : content.map((part) => part.text ?? "").join("\n"))).join("\n");
};

const SSE: Array<[string, unknown]> = [
  ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }],
  ["message_stop", { type: "message_stop" }],
];

async function session(hooks: (made: Made) => Hooks): Promise<{ log: string[]; requested: string; contexts: string[] }> {
  const root = mkdtempSync(join(tmpdir(), "skills-cc-live-"));
  roots.push(root);
  const dir = join(root, "dispatcher");
  const work = join(root, "work");
  for (const path of [dir, work, join(root, "config"), join(root, "tmp")]) mkdirSync(path, { recursive: true });
  for (const [dest, bytes] of await valueOf(bundle(CLAUDE_BUNDLE, repo))) {
    writeFileSync(join(dir, basename(dest)), bytes);
  }
  writeFileSync(join(dir, INDEX), JSON.stringify(INDEXED));
  for (const [name, source] of Object.entries(SCRIPTS)) writeFileSync(join(root, name), source);
  const made: Made = { shipped: dispatcherHooks(dir), script: (name) => `bun ${join(root, name)}` };
  writeFileSync(join(root, "settings.json"), JSON.stringify({ hooks: hooks(made) }));

  const bodies: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = await req.text();
      if (!new URL(req.url).pathname.endsWith("/messages")) return Response.json({ input_tokens: 1 });
      bodies.push(body);
      return new Response(SSE.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""), {
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  try {
    const proc = Bun.spawn([claude ?? expect.unreachable("a session runs only where claude is installed"), "-p", "--settings", join(root, "settings.json"), "--model", "claude-sonnet-5", "say ok"], {
      cwd: work,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? root,
        TMPDIR: join(root, "tmp"),
        CLAUDE_CONFIG_DIR: join(root, "config"),
        XDG_STATE_HOME: join(root, "state"),
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.port}`,
        ANTHROPIC_API_KEY: "sk-stand-in",
        DISABLE_AUTOUPDATER: "1",
        DISABLE_TELEMETRY: "1",
        DISABLE_ERROR_REPORTING: "1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
    });
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    expect(await proc.exited, `claude -p failed: ${out}${err}`).toBe(0);
  } finally {
    await server.stop(true);
  }

  const logPath = join(root, "state", "skills", "dispatch.log");
  const log = existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter(Boolean) : [];
  const projects = join(root, "config", "projects");
  const contexts = [...new Bun.Glob("*/*.jsonl").scanSync(projects)].flatMap((rel) =>
    readFileSync(join(projects, rel), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line): unknown => JSON.parse(line))
      .flatMap((entry) => (isHookContext(entry) ? (entry.attachment.content ?? []) : [])),
  );
  return { log, requested: bodies.map(textOf).join("\n"), contexts };
}

const brokenIn = (log: readonly string[]): string[] => log.filter((line) => / broken (alpha|beta|gamma):/.test(line));

const PREVIEWED = "<persisted-output>";

test.skipIf(!claude)(
  skipReason(
    "it drives a real `claude`, so it runs only where Claude Code is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "Claude Code shows each hook's context whole up to CONTEXT_LIMIT characters and previews it past that, hook by hook",
    "local",
  ),
  async () => {
    const { contexts, requested } = await session(({ script }) => ({
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: `${script("sized.ts")} ${CONTEXT_LIMIT} within`, timeout: 15 }] },
        { matcher: "", hooks: [{ type: "command", command: `${script("sized.ts")} ${CONTEXT_LIMIT + 1} past`, timeout: 15 }] },
      ],
    }));
    const within = contexts.find((context) => context.startsWith("within"));
    expect(within?.length, "the context at the limit did not arrive whole").toBe(CONTEXT_LIMIT);
    expect(requested).toContain(within ?? expect.unreachable("no context at the limit arrived"));
    expect(contexts.filter((context) => context.startsWith(PREVIEWED)), "the context one past the limit was not previewed").toHaveLength(1);
  },
  60_000,
);

test.skipIf(!claude)(
  skipReason(
    "it drives a real `claude`, so it runs only where Claude Code is on PATH; the ci workflow installs a pinned one, a contributor's machine may not have it",
    "Rules past the limit from one prompt hook arrive as a preview and the check says so; the shipped prompt hooks deliver them whole",
    "local",
  ),
  async () => {
    expect(carriageFor(INDEXED, ["alpha", "beta", "gamma"]).length, "the Rules fit one hook, so this proves nothing").toBeGreaterThan(CONTEXT_LIMIT);

    const alone = await session(({ shipped, script }) => {
      const [first] = (shipped.UserPromptSubmit ?? []).flatMap((entry) => entry.hooks);
      return { ...shipped, UserPromptSubmit: [{ matcher: "", hooks: [{ ...first, command: `${script("unnamed.ts")} | ${first?.command}` }] }] };
    });
    expect(alone.contexts.map((context) => context.startsWith(PREVIEWED)), "the one hook's context was not previewed").toEqual([true]);
    expect(alone.requested).toContain("Output too large");
    expect(brokenIn(alone.log).map((line) => line.split(" ")[3]), "a previewed Rule went unreported").toEqual(["alpha:", "beta:", "gamma:"]);

    const shared = await session(({ shipped }) => shipped);
    expect(shared.log.filter((line) => line.includes(" inject ")), "no Rule went out, so this proves nothing").toHaveLength(3);
    expect(shared.contexts, "the Rules did not go out in parts").toHaveLength(2);
    for (const context of shared.contexts) expect(context.length).toBeLessThanOrEqual(CONTEXT_LIMIT);
    expect(shared.requested).not.toContain("Output too large");
    for (const rule of INDEXED.rules) expect(flat(shared.requested), `${rule.name} is not whole in the request`).toContain(flat(rule.text));
    expect(brokenIn(shared.log), "the shipped prompt hooks still lose a Rule").toEqual([]);
  },
  120_000,
);
