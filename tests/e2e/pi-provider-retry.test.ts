import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeContext, streamSimple, type AssistantMessage, type Model } from "@earendil-works/pi-ai/compat";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { REPO } from "../../src/generate/link";
import { Schema } from "effect";

const piSettings = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(await Bun.file(`${REPO}harness/pi/settings.json`).json());

const shipped = SettingsManager.inMemory(piSettings).getProviderRetrySettings();

const retryProofModel: Model<"openai-completions"> = {
  id: "retry-proof",
  name: "retry-proof",
  api: "openai-completions",
  provider: "retry-proof-provider",
  baseUrl: "https://retry-proof.invalid/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8000,
  maxTokens: 512,
};

function chunk(delta: unknown, finish: string | null): string {
  return `data: ${JSON.stringify({
    id: "chatcmpl-proof",
    object: "chat.completion.chunk",
    created: 1700000000,
    model: "retry-proof",
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

function rateLimited(extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ error: { message: "Upstream request failed", code: "rate_limit_exceeded" } }),
    { status: 429, headers: { "content-type": "application/json", ...extraHeaders } },
  );
}

function recovered(): Response {
  return new Response(`${chunk({ role: "assistant", content: "recovered" }, null)}${chunk({}, "stop")}data: [DONE]\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function drive(planned: Response[], maxRetries: number | undefined, maxRetryDelayMs: number) {
  let attempts = 0;
  const stubFetch: typeof fetch = Object.assign(async (): Promise<Response> => {
    attempts += 1;
    const next = planned.shift();
    if (next === undefined) throw new Error("the stub ran out of planned responses");
    return next;
  }, { preconnect: (): void => undefined });
  const done = streamSimple(
    retryProofModel,
    normalizeContext({ messages: [{ role: "user", content: [{ type: "text", text: "hi" }], timestamp: Date.now() }] }),
    { apiKey: "retry-proof", fetch: stubFetch, maxRetryDelayMs, ...(maxRetries === undefined ? {} : { maxRetries }) },
  ).result();
  return { done, attempts: () => attempts };
}

function textOf(message: AssistantMessage): string {
  return message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

async function recoversOnTheSecondAttempt(run: ReturnType<typeof drive>): Promise<void> {
  const message = await run.done;
  expect(run.attempts()).toBe(2);
  expect(message.stopReason).toBe("stop");
  expect(textOf(message)).toBe("recovered");
}

test("the shipped settings carry a provider retry block that waits out a saturated window", () => {
  expect(shipped.maxRetries).toBe(12);
  expect(shipped.maxRetryDelayMs).toBe(180_000);
  expect(shipped.timeoutMs).toBeUndefined();
});

test("a 429 without a server wait is backed off inside the request and the stream recovers", async () => {
  await recoversOnTheSecondAttempt(drive([rateLimited(), recovered()], shipped.maxRetries, shipped.maxRetryDelayMs));
});

test("a server wait inside the cap is slept through and the stream recovers", async () => {
  await recoversOnTheSecondAttempt(drive([rateLimited({ "retry-after-ms": "120" }), recovered()], shipped.maxRetries, shipped.maxRetryDelayMs));
});

test("a server wait past the cap ends the turn as an error after one attempt", async () => {
  const run = drive([rateLimited({ "retry-after": "3600" })], shipped.maxRetries, shipped.maxRetryDelayMs);
  const message = await run.done;
  expect(run.attempts()).toBe(1);
  expect(message.stopReason).toBe("error");
  expect(message.errorMessage).toContain("max: 180s");
});

test("without the provider block the provider request is not retried", async () => {
  const bare = SettingsManager.inMemory({}).getProviderRetrySettings();
  expect(bare.maxRetries).toBeUndefined();
  const run = drive([rateLimited(), recovered()], bare.maxRetries, bare.maxRetryDelayMs);
  const message = await run.done;
  expect(run.attempts()).toBe(1);
  expect(message.stopReason).toBe("error");
});

async function inSession(settings: typeof piSettings, planned: Response[]) {
  let attempts = 0;
  const server = Bun.serve({
    port: 0,
    fetch: (): Response => {
      attempts += 1;
      return planned.shift() ?? new Response("the stub ran out of planned responses", { status: 500 });
    },
  });
  const agentDir = mkdtempSync(join(tmpdir(), "skills-pi-retry-"));
  try {
    writeFileSync(
      join(agentDir, "models.json"),
      JSON.stringify({
        providers: {
          [retryProofModel.provider]: {
            baseUrl: `http://127.0.0.1:${server.port}/v1`,
            api: "openai-completions",
            apiKey: "retry-proof",
            models: [{ id: retryProofModel.id }],
          },
        },
      }),
    );
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: join(agentDir, "models.json"),
      refreshOnCreate: false,
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: agentDir,
      agentDir,
      settingsManager: SettingsManager.inMemory(),
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: agentDir,
      agentDir,
      model: modelRuntime.getModel(retryProofModel.provider, retryProofModel.id) ?? expect.unreachable("models.json names the retry-proof model"),
      modelRuntime,
      resourceLoader,
      settingsManager: SettingsManager.inMemory(settings),
      sessionManager: SessionManager.inMemory(agentDir),
      noTools: "all",
    });
    let agentRetries = 0;
    session.subscribe((event) => {
      if (event.type === "auto_retry_start") agentRetries += 1;
    });
    try {
      await session.prompt("hi");
    } finally {
      session.dispose();
    }
    const replies = session.messages
      .filter((message): message is AssistantMessage => message.role === "assistant")
      .map((reply) => [reply.stopReason, textOf(reply)]);
    return { attempts, agentRetries, replies };
  } finally {
    await server.stop(true);
    rmSync(agentDir, { recursive: true, force: true });
  }
}

test("a session built on the shipped settings retries a 429 inside the request and never reaches the agent-level retry", async () => {
  const run = await inSession(piSettings, [rateLimited(), recovered()]);
  expect(run.attempts).toBe(2);
  expect(run.agentRetries).toBe(0);
  expect(run.replies).toEqual([["stop", "recovered"]]);
});

test("a session built without the provider block restarts the turn through the agent-level retry instead", async () => {
  const run = await inSession({}, [rateLimited(), recovered()]);
  expect(run.attempts).toBe(2);
  expect(run.agentRetries).toBe(1);
  expect(run.replies).toEqual([["stop", "recovered"]]);
});
