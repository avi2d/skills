import { Effect, Option, type FileSystem } from "effect";
import { HARNESSES, REACHABLE, at, consulted, dirOf, prose, receives, target, type Body } from "../bodies/bodies";
import { readGeneratedRoot } from "./bundle";
import { FileFailure, UncomposableBodies, type MalformedBody } from "../platform/failures";
import { MACOS_INDEX, attempt, entriesOf, entryAt, filesUnder, unlessAbsent, type Entry } from "../platform/files";

export const hubUnder = (root: string): string => `${root}/skills`;

export const consultable = Effect.fnUntraced(function* (
  bodies: readonly Body[],
): Effect.fn.Return<void, UncomposableBodies | MalformedBody> {
  for (const body of bodies) {
    for (const name of consulted(body)) {
      const found = yield* target(body, "consults", name, bodies);
      if (!REACHABLE.includes(found.kind)) {
        return yield* at(body, "consults", `names ${dirOf(found)}, and only a ${REACHABLE.join(" or a ")} is reached by name`);
      }
      const unreached = HARNESSES.filter((harness) => receives(body, harness) && !receives(found, harness));
      if (unreached.length > 0) {
        return yield* at(
          body,
          "consults",
          `names ${JSON.stringify(name)}, which ${unreached.join(" and ")} does not receive, so a reader there is sent to a Body it was not given`,
        );
      }
      if ((yield* prose(body)).includes(`\`${name}\``)) continue;
      return yield* at(
        body,
        "consults",
        `names ${JSON.stringify(name)}, and the Body never writes \`${name}\`, so nothing sends a reader there`,
      );
    }
  }
});

const unique = Effect.fnUntraced(function* (bodies: readonly Body[]): Effect.fn.Return<void, UncomposableBodies> {
  const taken = new Map<string, string>();
  for (const body of bodies) {
    const first = taken.get(body.name);
    if (first !== undefined) {
      return yield* new UncomposableBodies({ message: `two Bodies are named ${body.name}: ${first} and ${dirOf(body)}` });
    }
    taken.set(body.name, dirOf(body));
  }
});

export const hub = Effect.fnUntraced(function* (
  bodies: readonly Body[],
  dormant: readonly Body[] = [],
): Effect.fn.Return<Map<string, string>, UncomposableBodies> {
  yield* unique(bodies);

  const out = new Map<string, string>();
  for (const body of bodies) {
    if (REACHABLE.includes(body.kind)) out.set(body.name, dirOf(body));
  }

  // Every Body may consult, and only the reached one is in the Hub, so this asks more than the Hub's own membership.
  // A dormant Rule is in the index for a project to switch on, so its pointer can dangle too.
  for (const body of [...bodies, ...dormant]) {
    for (const name of consulted(body)) {
      if (out.has(name)) continue;
      return yield* at(body, "consults", `names ${JSON.stringify(name)}, which the Hub does not offer`);
    }
  }

  return out;
});

export type HubOutcome = {
  entry: string;
  state: "kept" | "linked" | "relinked" | "unlinked" | "moved" | "retired" | "left";
};

// A symlink into this repo is one this step made; anything else in a Hub belongs to whoever put it there.
const ourLink = (points: string | undefined, repo: string): points is string =>
  points !== undefined && points.startsWith(repo);

// A directory holding a link this step made is a root an earlier build wrote; a Body another tool installed holds none.
const ourRoot = Effect.fnUntraced(function* (dir: string, repo: string): Effect.fn.Return<boolean, FileFailure, FileSystem.FileSystem> {
  for (const { entry } of yield* entriesOf(dir)) {
    if (entry.kind === "link" && ourLink(entry.points, repo)) return true;
  }
  return false;
});

const present = (path: string): Effect.Effect<boolean, FileFailure, FileSystem.FileSystem> =>
  Effect.map(unlessAbsent(entryAt(path)), Option.isSome);

const sameBytes = Effect.fnUntraced(function* (a: string, b: string): Effect.fn.Return<boolean, FileFailure, FileSystem.FileSystem> {
  const files = yield* filesUnder(a);
  if (files.join("\n") !== (yield* filesUnder(b)).join("\n")) return false;
  for (const file of files) {
    const x = yield* attempt(`${a}/${file}`, (fs) => fs.readFile(`${a}/${file}`));
    const y = yield* attempt(`${b}/${file}`, (fs) => fs.readFile(`${b}/${file}`));
    if (x.length !== y.length || !x.every((byte, i) => byte === y[i])) return false;
  }
  return true;
});

// FileSystem has no rmdir, and its remove takes a directory something was written into after its entries were counted.
const emptied = Effect.fnUntraced(function* (dir: string): Effect.fn.Return<void, FileFailure, FileSystem.FileSystem> {
  const left = yield* attempt(dir, (fs) => fs.readDirectory(dir));
  if (left.length > 0) return yield* new FileFailure({ path: dir, message: `${dir} still holds ${left.join(", ")}` });
  yield* attempt(dir, (fs) => fs.remove(dir, { recursive: true }));
});

type Step = { path: string; act: "unlink" | "drop" | "move" };

// Nothing is touched until every entry has a step, so a refusal leaves the root as it was found.
const retire = Effect.fnUntraced(function* (
  old: string,
  dir: string,
  repo: string,
  outcomes: HubOutcome[],
): Effect.fn.Return<void, FileFailure, FileSystem.FileSystem> {
  const steps: Step[] = [];
  for (const { name, entry } of yield* entriesOf(old)) {
    const path = `${old}/${name}`;
    if (name === MACOS_INDEX) {
      steps.push({ path, act: "drop" });
    } else if (entry.kind === "link" && ourLink(entry.points, repo)) {
      steps.push({ path, act: "unlink" });
    } else if (!(yield* present(`${dir}/${name}`))) {
      steps.push({ path, act: "move" });
    } else if (entry.kind === "directory" && (yield* sameBytes(path, `${dir}/${name}`))) {
      steps.push({ path, act: "drop" });
    } else {
      const dest = `${dir}/${name}`;
      return yield* new FileFailure({ path: dest, message: `${path} and ${dest} both claim ${name}` });
    }
  }
  for (const { path, act } of steps) {
    const name = path.slice(old.length + 1);
    if (act === "unlink") yield* attempt(path, (fs) => fs.remove(path));
    else if (act === "drop") yield* attempt(path, (fs) => fs.remove(path, { recursive: true }));
    else {
      yield* attempt(path, (fs) => fs.rename(path, `${dir}/${name}`));
      outcomes.push({ entry: name, state: "moved" });
    }
  }
  yield* emptied(old);
});

type Found = Extract<HubOutcome["state"], "kept" | "unlinked" | "retired" | "left"> | "repointed";

const settled = Effect.fnUntraced(function* (
  repo: string,
  dir: string,
  wanted: ReadonlyMap<string, string>,
  { name, entry }: { name: string; entry: Entry },
  outcomes: HubOutcome[],
): Effect.fn.Return<Found, FileFailure, FileSystem.FileSystem> {
  const path = `${dir}/${name}`;
  const points = entry.kind === "link" ? entry.points : undefined;
  if (!ourLink(points, repo)) {
    if (entry.kind !== "directory" || !(yield* ourRoot(path, repo))) return "left";
    yield* retire(path, dir, repo, outcomes);
    return "retired";
  }
  const to = wanted.get(name);
  if (to !== undefined && points === `${repo}${to}`) return "kept";
  yield* attempt(path, (fs) => fs.remove(path));
  return to === undefined ? "unlinked" : "repointed";
});

export const reconcile = Effect.fnUntraced(function* (
  repo: string,
  root: string,
  wanted: Map<string, string>,
): Effect.fn.Return<HubOutcome[], FileFailure, FileSystem.FileSystem> {
  const dir = `${repo}${root}`;
  yield* attempt(dir, (fs) => fs.makeDirectory(dir, { recursive: true }));

  const outcomes: HubOutcome[] = [];
  const standing = new Set<string>();
  const repointed = new Set<string>();
  for (const named of yield* entriesOf(dir)) {
    const found = yield* settled(repo, dir, wanted, named, outcomes);
    if (found === "repointed") repointed.add(named.name);
    else outcomes.push({ entry: named.name, state: found });
    if (found === "kept") standing.add(named.name);
  }

  for (const [name, to] of wanted) {
    if (standing.has(name)) continue;
    yield* attempt(`${dir}/${name}`, (fs) => fs.symlink(`${repo}${to}`, `${dir}/${name}`));
    outcomes.push({ entry: name, state: repointed.has(name) ? "relinked" : "linked" });
  }
  return outcomes;
});

export const hubs = Effect.fnUntraced(function* (
  repo: string,
  bodies: readonly Body[],
  dormant: readonly Body[],
): Effect.fn.Return<HubOutcome[], FileFailure | UncomposableBodies, FileSystem.FileSystem> {
  return yield* reconcile(repo, hubUnder(yield* readGeneratedRoot), yield* hub(bodies, dormant));
});
