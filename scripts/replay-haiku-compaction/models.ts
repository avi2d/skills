import { Console, Effect } from "effect";
import { ModelRegistry, createAgentSessionServices } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Context } from "@earendil-works/pi-ai";
import { SUMMARIZATION_SYSTEM_PROMPT, summaryTextOf } from "../../harness/pi/extensions/haiku-compaction";
import { ModelError } from "./scoring";
import { DEFAULT_MAX_OUTPUT_TOKENS, estimatedTokens, splitModelRef, type ArmTokens } from "./report";

export type Model = { provider: string; id: string; maxTokens: number };

export function registryOf(cwd: string): Effect.Effect<ModelRegistry, ModelError> {
  return Effect.tryPromise({
    try: () => createAgentSessionServices({ cwd }).then((services) => new ModelRegistry(services.modelRuntime)),
    catch: (cause) => new ModelError({ message: "cannot build model registry: " + String(cause) }),
  });
}

export function resolveModel(registry: ModelRegistry, ref: string): Effect.Effect<Model, ModelError> {
  return Effect.gen(function* () {
    const [provider, id] = splitModelRef(ref);
    const model = registry.find(provider, id);
    if (!model) return yield* new ModelError({ message: ref + " is not in the model registry" });
    if (!registry.hasConfiguredAuth(model)) return yield* new ModelError({ message: ref + " has no configured auth" });
    return { provider, id, maxTokens: model.maxTokens > 0 ? model.maxTokens : DEFAULT_MAX_OUTPUT_TOKENS };
  });
}

export function runArm(
  registry: ModelRegistry,
  model: Model,
  prompt: string,
  maxOutputTokens: number,
): Effect.Effect<{ text: string; cost: number; tokens: ArmTokens }, ModelError> {
  return Effect.gen(function* () {
    const found = registry.find(model.provider, model.id);
    if (!found) return yield* new ModelError({ message: model.provider + "/" + model.id + " vanished from the registry" });
    const response = yield* completeWithRetry(registry, model, found, prompt, maxOutputTokens);
    const text = summaryTextOf(response);
    if (!text) return yield* new ModelError({ message: "empty summary from " + model.provider + "/" + model.id });
    const usage = response.usage;
    const cost = usage.cost.total;
    yield* Console.log(model.provider + "/" + model.id + " in=" + String(usage.input) + " out=" + String(usage.output) + " read=" + String(usage.cacheRead) + " write=" + String(usage.cacheWrite) + " cost=" + String(cost));
    return {
      text,
      cost,
      tokens: {
        calls: 1,
        reportedInput: usage.input + usage.cacheRead + usage.cacheWrite,
        reportedOutput: usage.output,
        estimatedInput: estimatedTokens(SUMMARIZATION_SYSTEM_PROMPT + prompt),
        estimatedOutput: estimatedTokens(text),
      },
    };
  });
}

function completeWithRetry(
  registry: ModelRegistry,
  model: Model,
  resolved: NonNullable<ReturnType<ModelRegistry["find"]>>,
  prompt: string,
  maxOutputTokens: number,
): Effect.Effect<AssistantMessage, ModelError> {
  return Effect.tryPromise({
    try: () => {
      const context: Context = {
        systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
      };
      const attempt = (): Promise<AssistantMessage> =>
        registry.complete(resolved, context, {
          maxTokens: Math.min(maxOutputTokens, model.maxTokens),
          cacheRetention: "none",
          sessionId: model.provider + "-" + String(Date.now()),
          signal: AbortSignal.timeout(1_200_000),
        });
      const retryable = (response: AssistantMessage): boolean =>
        (response.stopReason === "error" && transientError(response.errorMessage)) ||
        (response.stopReason === "stop" && summaryTextOf(response) === undefined);
      return attempt().then((first) => {
        if (!retryable(first)) return first;
        return attempt().then((second) => {
          if (!retryable(second)) return second;
          return attempt();
        });
      });
    },
    catch: (cause) => (cause instanceof ModelError ? cause : new ModelError({ message: "complete failed for " + model.provider + "/" + model.id + ": " + String(cause) })),
  });
}

function transientError(message: string | undefined): boolean {
  return message !== undefined && (message.includes("429:") || message.includes("502:") || message.includes("503:"));
}
