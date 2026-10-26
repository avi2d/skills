import { Schema } from "effect";
import { REPO } from "../../src/generate/link";

const Hooks = Schema.Record(Schema.String, Schema.Array(Schema.Struct({ hooks: Schema.Array(Schema.Struct({ command: Schema.optionalKey(Schema.String) })) })));
const decodeWhole = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));
const decodePiSettings = Schema.decodeUnknownSync(
  Schema.Struct({
    theme: Schema.optionalKey(Schema.String),
    extensions: Schema.optionalKey(Schema.Array(Schema.String)),
    defaultTools: Schema.optionalKey(Schema.Array(Schema.String)),
    codemode: Schema.optionalKey(Schema.Struct({ mode: Schema.optionalKey(Schema.Literals(["on", "only"])) })),
    compaction: Schema.optionalKey(
      Schema.Struct({
        reserveTokens: Schema.optionalKey(Schema.Int),
        modelOverrides: Schema.optionalKey(Schema.Record(Schema.String, Schema.Struct({ reserveTokens: Schema.Int, keepRecentTokens: Schema.optionalKey(Schema.Int) }))),
      }),
    ),
  }),
);
const decodeCcSettings = Schema.decodeUnknownSync(
  Schema.Struct({
    theme: Schema.optionalKey(Schema.String),
    statusLine: Schema.optionalKey(Schema.Struct({ command: Schema.optionalKey(Schema.String) })),
    hooks: Schema.optionalKey(Hooks),
  }),
);
const decodeCodexHooks = Schema.decodeUnknownSync(Schema.Struct({ hooks: Schema.optionalKey(Hooks) }));

export const piSettingsFile = decodeWhole(await Bun.file(`${REPO}harness/pi/settings.json`).json());
export const piSettings = decodePiSettings(piSettingsFile);
export const ccSettings = decodeCcSettings(await Bun.file(`${REPO}harness/claude-code/settings.json`).json());
export const codexHooks = decodeCodexHooks(await Bun.file(`${REPO}harness/codex/hooks.json`).json());

export const HERDR_OWNED: Record<string, { id: string; version: string }> = {
  ".pi/agent/extensions/herdr-agent-state.ts": { id: "pi", version: "9" },
  ".claude/hooks/herdr-agent-state.sh": { id: "claude", version: "10" },
};
