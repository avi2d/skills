import { existsSync } from "node:fs";
import { Schema } from "effect";
import { noMistakesConfigOf } from "../../../src/generate/no-mistakes-config";
import { piSettings, piSettingsFile } from "../../lib/harness-settings";

const COMPACTION_POINT = 150_000;

const overrides = piSettings.compaction?.modelOverrides ?? {};

type ModelKey = { readonly provider: string; readonly id: string };

const modelKeyOf = (key: string): ModelKey => {
  const [, provider, id] = /^([^/]+)\/(.+)$/.exec(key) ?? [];
  if (provider === undefined || id === undefined) throw new Error(`${key} names no <provider>/<id>`);
  return { provider, id };
};

const catalogProviderOf = (provider: string): string => (provider === "claude-bridge" ? "anthropic" : provider);

const RemoteCatalog = Schema.Array(
  Schema.Struct({ id: Schema.String, type: Schema.optionalKey(Schema.String), contextWindow: Schema.optionalKey(Schema.Finite) }),
);
const decodeRemoteCatalog = Schema.decodeUnknownSync(RemoteCatalog);
const remoteCatalogs = new Map<string, Promise<typeof RemoteCatalog.Type>>();

// pi adds the models its pinned catalog predates from this endpoint at run time.
const remoteCatalog = (provider: string): Promise<typeof RemoteCatalog.Type> => {
  const known = remoteCatalogs.get(provider);
  if (known !== undefined) return known;
  const url = `https://pi.dev/api/models/providers/${encodeURIComponent(provider)}?types=chat`;
  const loaded = fetch(url, { signal: AbortSignal.timeout(20_000) }).then(async (response) => {
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return decodeRemoteCatalog(await response.json());
  });
  remoteCatalogs.set(provider, loaded);
  return loaded;
};

const builtinCatalog = import("@earendil-works/pi-ai/providers/all").then(({ builtinModels }) => builtinModels());

const catalogWindowOf = async ({ provider, id }: ModelKey): Promise<number | undefined> => {
  const catalogProvider = catalogProviderOf(provider);
  const builtin = (await builtinCatalog).getModel(catalogProvider, id);
  if (builtin !== undefined) return builtin.contextWindow;
  const remote = (await remoteCatalog(catalogProvider)).find((model) => model.id === id && (model.type ?? "chat") === "chat");
  return remote?.contextWindow;
};

export type CompactionPoint = { readonly key: string; readonly window: number | undefined; readonly reserve: number; readonly compactsAtPoint: boolean };

export const compactionPoints = async (): Promise<CompactionPoint[]> => {
  const { SettingsManager, shouldCompact } = await import("@earendil-works/pi-coding-agent");
  const settings = SettingsManager.inMemory(piSettingsFile);
  return Promise.all(
    Object.keys(overrides).map(async (key) => {
      const model = modelKeyOf(key);
      const window = await catalogWindowOf(model);
      const compaction = settings.getCompactionSettings(model);
      const compactsAtPoint =
        window !== undefined && !shouldCompact(COMPACTION_POINT, window, compaction) && shouldCompact(COMPACTION_POINT + 1, window, compaction);
      return { key, window, reserve: compaction.reserveTokens, compactsAtPoint };
    }),
  );
};

export const withoutOverride = (models: readonly string[]): string[] => models.filter((model) => !Object.hasOwn(overrides, model));

const reviewConfig = noMistakesConfigOf("/home/someone");
export const reviewPiModels = [
  reviewConfig.agent_config.pi.model,
  ...reviewConfig.reviewer_chain.map(({ model }) => model),
];

const DispatchEntry = Schema.Struct({ harness: Schema.String, model: Schema.String });
const decodeDispatchRules = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ rules: Schema.Array(Schema.Struct({ use: Schema.Array(DispatchEntry) })), default: Schema.Array(DispatchEntry) })),
);

const dispatchRulesFile = process.env.SKILLS_DISPATCH_RULES_FILE || undefined;
if (dispatchRulesFile !== undefined && !existsSync(dispatchRulesFile)) {
  throw new Error(`SKILLS_DISPATCH_RULES_FILE points at ${dispatchRulesFile}, which does not exist`);
}

const dispatchRules = dispatchRulesFile === undefined ? undefined : decodeDispatchRules(await Bun.file(dispatchRulesFile).text());
export const dispatchedPiModels =
  dispatchRules === undefined
    ? undefined
    : [...new Set([...dispatchRules.rules.flatMap(({ use }) => use), ...dispatchRules.default].filter(({ harness }) => harness === "pi").map(({ model }) => model))];
