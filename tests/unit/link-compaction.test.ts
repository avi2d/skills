import { expect, test } from "bun:test";
import { piSettings, piSettingsFile } from "../lib/harness-settings";

test("pi compacts each claude-bridge model and each per-token worker model at about 150k of its registered window, and no other model early", async () => {
  const { SettingsManager, shouldCompact } = await import("@earendil-works/pi-coding-agent");
  const { getBuiltinModel } = await import("@earendil-works/pi-ai/providers/all");
  const settings = SettingsManager.inMemory(piSettingsFile);
  const defaults = SettingsManager.inMemory({});
  const bridgeCompactsAt = ({ id, contextWindow }: { id: string; contextWindow: number }, tokens: number) =>
    shouldCompact(tokens, contextWindow, settings.getCompactionSettings({ provider: "claude-bridge", id }));
  for (const claude of [
    getBuiltinModel("anthropic", "claude-fable-5-1"),
    getBuiltinModel("anthropic", "claude-fable-5-2"),
    getBuiltinModel("anthropic", "claude-opus-5"),
    getBuiltinModel("anthropic", "claude-opus-5-5"),
    getBuiltinModel("anthropic", "claude-sonnet-5"),
    getBuiltinModel("anthropic", "claude-sonnet-5-5"),
    getBuiltinModel("anthropic", "claude-haiku-5-5"),
  ]) {
    const { id } = claude;
    expect(bridgeCompactsAt(claude, 150_000), `${id} compacts at 150k rather than past it`).toBe(false);
    expect(bridgeCompactsAt(claude, 150_001), `${id} runs past 150k`).toBe(true);
    expect(
      settings.getCompactionKeepRecentTokens({ provider: "claude-bridge", id }),
      `${id} keeps a 10k tail, under pi's 20k default`,
    ).toBe(10_000);
  }
  for (const worker of [
    getBuiltinModel("openrouter", "deepseek/deepseek-v4-pro-0813"),
    getBuiltinModel("openrouter", "z-ai/glm-5.3"),
    getBuiltinModel("opencode-go", "muse-spark-1.3-contributor"),
    getBuiltinModel("opencode-go", "deepseek-v4-pro"),
    getBuiltinModel("opencode-go", "glm-5.3"),
  ]) {
    const { provider, id } = worker;
    const workerCompactsAt = (tokens: number) =>
      shouldCompact(tokens, worker.contextWindow, settings.getCompactionSettings({ provider, id }));
    expect(workerCompactsAt(150_000), `${provider}/${id} compacts before 150k`).toBe(false);
    expect(workerCompactsAt(151_000), `${provider}/${id} runs past about 150k`).toBe(true);
    expect(settings.getCompactionKeepRecentTokens({ provider, id })).toBe(defaults.getCompactionKeepRecentTokens());
  }
  const openrouterMuse = getBuiltinModel("openrouter", "meta/muse-spark-1.3-contributor");
  expect(
    shouldCompact(
      151_000,
      openrouterMuse.contextWindow,
      settings.getCompactionSettings({ provider: "openrouter", id: openrouterMuse.id }),
    ),
    "muse is a worker on opencode-go only",
  ).toBe(false);
  expect(settings.getCompactionReserveTokens({ provider: "claude-bridge", id: "claude-sonnet-5" })).toBe(850_000);
  expect(bridgeCompactsAt(getBuiltinModel("anthropic", "claude-haiku-4-5"), 150_001), "a model with no point compacts early").toBe(false);
  expect(settings.getCompactionReserveTokens({ provider: "claude-bridge", id: "claude-haiku-4-5" })).toBe(
    defaults.getCompactionReserveTokens(),
  );
  expect(settings.getCompactionKeepRecentTokens({ provider: "claude-bridge", id: "claude-haiku-4-5" })).toBe(
    defaults.getCompactionKeepRecentTokens(),
  );
});

test("every compaction override is keyed by a provider and id that pi resolves it for", async () => {
  const { SettingsManager } = await import("@earendil-works/pi-coding-agent");
  const overrides = Object.entries(piSettings.compaction?.modelOverrides ?? {});
  expect(overrides.length, "no compaction override to check").toBeGreaterThan(0);
  const settings = SettingsManager.inMemory(piSettingsFile);
  const unmatched = overrides
    .filter(([key, { reserveTokens, keepRecentTokens }]) => {
      const [, provider, id] = /^([^/]+)\/(.+)$/.exec(key) ?? [];
      return (
        provider === undefined ||
        id === undefined ||
        settings.getCompactionReserveTokens({ provider, id }) !== reserveTokens ||
        (keepRecentTokens !== undefined && settings.getCompactionKeepRecentTokens({ provider, id }) !== keepRecentTokens)
      );
    })
    .map(([key]) => key);
  expect(unmatched, "pi never matches these keys, so each model keeps the 16384-token default reserve").toEqual([]);
});

test("pi compacts the latest sol, astra, terra and luna on either OpenAI provider at 150k of its registered window, not at pi's default reserve near the window's end", async () => {
  const { SettingsManager, shouldCompact } = await import("@earendil-works/pi-coding-agent");
  const { getBuiltinModel } = await import("@earendil-works/pi-ai/providers/all");
  const settings = SettingsManager.inMemory(piSettingsFile);
  const defaults = SettingsManager.inMemory({});
  for (const provider of ["openai", "openai-codex"] as const) {
    for (const { id, contextWindow } of (["gpt-6.1-sol", "gpt-6-astra", "gpt-6.1-terra", "gpt-6-luna"] as const).map((latest) => getBuiltinModel(provider, latest))) {
      const compactsAt = (tokens: number) => shouldCompact(tokens, contextWindow, settings.getCompactionSettings({ provider, id }));
      expect(compactsAt(150_000), `${provider}/${id} compacts before 150k`).toBe(false);
      expect(compactsAt(150_001), `${provider}/${id} runs past 150k`).toBe(true);
      expect(settings.getCompactionReserveTokens({ provider, id }), `${provider}/${id} reserves its window minus 150k`).toBe(contextWindow - 150_000);
      expect(settings.getCompactionKeepRecentTokens({ provider, id })).toBe(defaults.getCompactionKeepRecentTokens());
    }
  }
});

test("an OpenAI model other than the latest sol, astra, terra and luna carries no compaction override instead of one per catalog entry", () => {
  const openai = Object.keys(piSettings.compaction?.modelOverrides ?? {}).filter((key) => /^openai(-codex)?\//.test(key));
  expect(openai.toSorted()).toEqual(
    ["openai", "openai-codex"].flatMap((provider) => ["gpt-6.1-sol", "gpt-6-astra", "gpt-6.1-terra", "gpt-6-luna"].map((id) => `${provider}/${id}`)).toSorted(),
  );
});
