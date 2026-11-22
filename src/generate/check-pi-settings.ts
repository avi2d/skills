import { Config, Effect, Equal, Option } from "effect";
import { FileFailure } from "../platform/failures";
import { main } from "../platform/platform";
import { MERGED, REPO, settingsAt, wantedSettings, type Settings } from "./link";

const rel = ".pi/agent/settings.json";
const merge = MERGED[rel];

main(Effect.gen(function* () {
  if (!merge) return yield* new FileFailure({ path: rel, message: "pi settings are not configured for installation" });
  const home = yield* Config.NonEmptyString("HOME").pipe(
    Effect.mapError(() => new FileFailure({ path: "$HOME", message: "no $HOME to check" })),
  );
  const source = yield* settingsAt(`${REPO}${merge.from}`);
  if (Option.isNone(source)) return yield* new FileFailure({ path: merge.from, message: "checkout settings are missing" });
  const installed = yield* settingsAt(`${home}/${rel}`);
  const live: Settings = Option.getOrElse(installed, () => ({}));
  const wanted = wantedSettings(source.value, live, (key) => merge.ownKeys.includes(key));
  const keys = new Set([...Object.keys(wanted), ...Object.keys(live)]);
  const drift: string[] = [];
  for (const key of [...keys].sort()) {
    if (!Object.hasOwn(live, key)) drift.push(`missing ${key}`);
    else if (!Object.hasOwn(wanted, key)) drift.push(`extra ${key}`);
    else if (!Equal.equals(live[key], wanted[key])) drift.push(`different ${key}`);
  }
  if (Option.isNone(installed)) drift.unshift("settings file missing");
  if (drift.length) {
    console.log(`drift    ~/${rel}: ${drift.join(", ")}; run bun run link`);
    process.exitCode = 1;
  } else console.log(`clean    ~/${rel}`);
}));
