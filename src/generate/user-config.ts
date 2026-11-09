import { Config, Context, Effect, FileSystem, Option, Schema } from "effect";
import { FileFailure } from "../platform/failures";
import { attempt, unlessAbsent } from "../platform/files";

const underHome = (dir: string): boolean => dir !== "" && !dir.startsWith("/") && !dir.startsWith("~") && !dir.split("/").includes("..");

const HomeDir = Schema.String.check(Schema.makeFilter((dir: string) => underHome(dir) || `\`${dir}\` names no directory under $HOME; give it relative to $HOME, such as \`.claude-work\``));

// A key the schema does not declare is dropped rather than refused, so a config written for a newer checkout still loads.
const UserConfigSchema = Schema.Struct({
  claudeConfigDirs: Schema.optionalKey(Schema.Array(HomeDir)),
});

export type UserConfig = typeof UserConfigSchema.Type;

const decodeUserConfig = Schema.decodeUnknownEffect(Schema.fromJsonString(UserConfigSchema));

const variable = (name: string) =>
  Config.String(name).pipe(
    Config.withDefault(""),
    Effect.mapError((cause) => new FileFailure({ path: `$${name}`, message: cause.message })),
  );

const userConfigPath: Effect.Effect<Option.Option<string>, FileFailure> = Effect.gen(function* () {
  const named = yield* variable("SKILLS_CONFIG");
  if (named !== "") return Option.some(named);
  const xdg = yield* variable("XDG_CONFIG_HOME");
  const home = yield* variable("HOME");
  const base = xdg !== "" ? xdg : home !== "" ? `${home}/.config` : "";
  return base === "" ? Option.none() : Option.some(`${base}/skills/config.json`);
});

export const readUserConfig: Effect.Effect<UserConfig, FileFailure, FileSystem.FileSystem> = Effect.gen(function* () {
  const path = yield* userConfigPath;
  if (Option.isNone(path)) return {};
  const text = yield* unlessAbsent(attempt(path.value, (fs) => fs.readFileString(path.value)));
  if (Option.isNone(text)) return {};
  return yield* decodeUserConfig(text.value).pipe(
    Effect.mapError((cause) => new FileFailure({ path: path.value, message: `${path.value} is not a skills config: ${cause.message}` })),
  );
});

export const UserConfigSource = Context.Reference("skills/UserConfig", { defaultValue: () => readUserConfig });
