import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { isPipeGap, quoted, splitStages, type SplitStage } from "./rerun";
import { UNRESOLVED, expandVars, mktempAssignment } from "./shell-vars";

export const COMMIT_IDENTITY_REFUSAL =
  "This commit sets its own author or committer. Commit as the identity the repository already resolves to, which git config user.name and git config user.email print. Set an identity only inside a throwaway repository a test creates under the temp directory.";

export const COMMIT_IDENTITY_LINE = "commit-identity: refused a commit that sets its own author or committer";

const tempRoots = (): string[] => {
  const roots = new Set<string>();
  for (const candidate of [tmpdir(), "/tmp", "/private/tmp"]) {
    try {
      roots.add(realpathSync(candidate));
    } catch {
    }
  }
  return [...roots];
};

const underTemp = (cwd: string): boolean => {
  if (cwd.includes("$") || cwd.includes("`")) return false;
  try {
    const roots = tempRoots();
    try {
      const dir = realpathSync(resolve(cwd));
      return roots.some((root) => dir === root || dir.startsWith(root + sep));
    } catch {
      let base = resolve(cwd);
      for (;;) {
        if (existsSync(base)) {
          const dir = realpathSync(base);
          return roots.some((root) => dir === root || dir.startsWith(root + sep));
        }
        const parent = dirname(base);
        if (parent === base) return false;
        base = parent;
      }
    }
  } catch {
    return false;
  }
};

const IDENTITY_VAR = /^GIT_(AUTHOR|COMMITTER)_[A-Z][A-Z_]*=/;

const LEADING_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=.*/;

const withoutEnv = (words: readonly string[]): readonly string[] => {
  let at = 0;
  while (at < words.length && LEADING_ASSIGNMENT.test(words[at] ?? "")) at += 1;
  return words.slice(at);
};

const expandHome = (dir: string, home: string): string =>
  dir === "~" || dir.startsWith("~/") ? join(home, dir.slice(1)) : dir;

const cdTarget = (words: readonly string[], home: string): string | undefined => {
  const target = withoutEnv(words).slice(1).find((word) => !word.startsWith("-"));
  if (target === undefined) return home;
  if (target === "-") return undefined;
  return expandHome(target, home);
};

const bodyEnd = (command: string, inside: readonly boolean[], open: number): number | undefined => {
  let depth = 0;
  for (let at = open; at < command.length; at += 1) {
    if (inside[at]) continue;
    if (command.charAt(at) === "{") depth += 1;
    else if (command.charAt(at) === "}") {
      depth -= 1;
      if (depth === 0) return at + 1;
    }
  }
  return undefined;
};

const functionBodies = (command: string): Array<{ from: number; to: number }> => {
  const inside = quoted(command);
  const bodies: Array<{ from: number; to: number }> = [];
  const header = /(^|[;&|()\s])(function\s+[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*\(\s*\))(\s*\(\s*\))?\s*\{/g;
  for (const match of command.matchAll(header)) {
    const open = match.index + match[0].lastIndexOf("{");
    if (inside[open]) continue;
    const end = bodyEnd(command, inside, open);
    if (end === undefined) continue;
    bodies.push({ from: match.index, to: end });
  }
  return bodies;
};

const readPointer = (dot: string): string | undefined => {
  let text: string;
  try {
    text = readFileSync(dot, "utf8");
  } catch {
    return undefined;
  }
  const prefix = "gitdir:";
  const first = text.split("\n", 1)[0] ?? "";
  if (!first.startsWith(prefix)) return dot;
  return resolve(dirname(dot), first.slice(prefix.length).trim());
};

const discoverGitDir = (base: string): string => {
  let dir: string;
  try {
    dir = realpathSync(base);
  } catch {
    return base;
  }
  for (;;) {
    const dot = join(dir, ".git");
    if (existsSync(dot)) return readPointer(dot) ?? dot;
    const parent = dirname(dir);
    if (parent === dir) return base;
    dir = parent;
  }
};

const applyGitFlag = (
  flag: string,
  value: string | undefined,
  dir: string,
  explicit: string | undefined,
  home: string,
): { dir: string; explicit: string | undefined; skip: boolean } => {
  if (flag === "-C" || flag === "--git-dir") {
    if (value === undefined) return { dir, explicit, skip: false };
    if (flag === "-C") return { dir: resolve(dir, expandHome(value, home)), explicit, skip: true };
    return { dir, explicit: expandHome(value, home), skip: true };
  }
  if (flag.startsWith("-C") && flag.length > 2) return { dir: resolve(dir, expandHome(flag.slice(2), home)), explicit, skip: false };
  if (flag.startsWith("--git-dir=")) return { dir, explicit: expandHome(flag.slice("--git-dir=".length), home), skip: false };
  return { dir, explicit, skip: false };
};

const gitGlobals = (globals: readonly string[], current: string, home: string): { dir: string; explicit: string | undefined } => {
  let dir = current;
  let explicit: string | undefined;
  for (let at = 0; at < globals.length; at += 1) {
    const next = applyGitFlag(globals[at] ?? "", globals[at + 1], dir, explicit, home);
    dir = next.dir;
    explicit = next.explicit;
    if (next.skip) at += 1;
  }
  return { dir, explicit };
};

const envGitDir = (words: readonly string[], bare: readonly string[], vars: Record<string, string>, home: string): string | undefined => {
  const local = words.slice(0, words.length - bare.length).reverse().find((word) => word.startsWith("GIT_DIR="));
  const envDir = (local === undefined ? vars.GIT_DIR : local.slice("GIT_DIR=".length)) ?? "";
  return envDir === "" ? undefined : expandHome(envDir, home);
};

const gitDirOf = (
  words: readonly string[],
  bare: readonly string[],
  git: number,
  commitAt: number,
  current: string,
  vars: Record<string, string>,
  home: string,
): string => {
  const globals = bare.slice(git + 1, commitAt);
  const { dir, explicit } = gitGlobals(globals, current, home);
  return explicit ?? envGitDir(words, bare, vars, home) ?? discoverGitDir(dir);
};

const ASSIGN_WORD = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const GAP_KEYWORDS = new Set(["then", "do", "else", "elif", "if", "for", "select", "while", "until", "case", "in", "function", "coproc", "time"]);
const FOLLOW_KEYWORDS = new Set(["then", "do", "else", "elif", "{", "!"]);

const gapHasKeyword = (gap: string): boolean =>
  gap.split(/[\s;&|(){}\n!]+/).some((token) => GAP_KEYWORDS.has(token));

const parenStateAt = (
  stages: readonly SplitStage[],
  inside: readonly boolean[],
  insideBody: (at: number) => boolean,
  index: number,
): { depth: number; unmatched: boolean } => {
  let depth = 0;
  let unmatched = false;
  for (let s = 0; s <= index; s += 1) {
    const stage = stages[s];
    if (stage === undefined) continue;
    const base = stage.start - stage.gap.length;
    for (let o = 0; o < stage.gap.length; o += 1) {
      const at = base + o;
      if (inside[at] === true || insideBody(at)) continue;
      if (stage.gap[o] === "(") depth += 1;
      else if (stage.gap[o] === ")") {
        if (depth === 0) unmatched = true;
        else depth -= 1;
      }
    }
  }
  return { depth, unmatched };
};

const gapHasBlocker = (
  gap: string,
  inside: readonly boolean[],
  base: number,
  insideBody: (at: number) => boolean,
): boolean => {
  if (gapHasKeyword(gap)) return true;
  for (let o = 0; o < gap.length; o += 1) {
    const at = base + o;
    if (inside[at] === true || insideBody(at)) continue;
    if (gap[o] === "{" || gap[o] === "!") return true;
  }
  return false;
};

const wordMentionsName = (word: string, name: string): boolean => {
  if (word.startsWith("-")) return false;
  const rest = word
    .replace(new RegExp("\\$\\{" + name + "\\}", "g"), "")
    .replace(new RegExp("\\$\\{" + name + "(?::)?[-+#?%^/][^}]*\\}", "g"), "")
    .replace(new RegExp("\\$" + name + "\\b", "g"), "");
  return new RegExp("(^|[^A-Za-z0-9_])" + name + "($|[^A-Za-z0-9_])").test(rest);
};

const unstableVars = (
  stages: readonly SplitStage[],
  command: string,
  inside: readonly boolean[],
  insideBody: (at: number) => boolean,
): Set<string> => {
  const assignments = new Map<string, Array<{ stage: number; word: number }>>();
  let dynamic = false;
  stages.forEach((stage, index) => {
    stage.words.forEach((word, at) => {
      if (word === "source" || word === "eval" || word === ".") dynamic = true;
      const found = ASSIGN_WORD.exec(word);
      if (found !== null) {
        const name = found[1] ?? "";
        assignments.set(name, [...(assignments.get(name) ?? []), { stage: index, word: at }]);
      }
    });
  });
  const frozen = new Set<string>();
  if (dynamic) {
    for (const name of assignments.keys()) frozen.add(name);
    return frozen;
  }
  for (const [name, at] of assignments) {
    if (at.length !== 1) { frozen.add(name); continue; }
    const only = at[0];
    if (only === undefined) { frozen.add(name); continue; }
    const stage = stages[only.stage];
    if (stage === undefined) { frozen.add(name); continue; }
    const words = stage.words;
    const made = mktempAssignment(command, stage);
    const steady = isAssignmentStage(words) || (made !== undefined && made.name === name) || withoutEnv(words)[0] === "export";
    if (!steady || insideBody(stage.start)) { frozen.add(name); continue; }
    const state = parenStateAt(stages, inside, insideBody, only.stage);
    if (state.depth > 0 || state.unmatched) { frozen.add(name); continue; }
    for (let s = 0; s < stages.length && !frozen.has(name); s += 1) {
      const other = stages[s];
      if (other === undefined) continue;
      for (let w = 0; w < other.words.length; w += 1) {
        if (s === only.stage && w === only.word) continue;
        if (wordMentionsName(other.words[w] ?? "", name)) { frozen.add(name); break; }
      }
    }
    if (frozen.has(name) || only.stage === 0) continue;
    const gap = stage.gap;
    if (gap.includes("&&") || gap.includes("||")) { frozen.add(name); continue; }
    if (!/[;\n]/.test(gap)) { frozen.add(name); continue; }
    const base = stage.start - gap.length;
    if (gapHasBlocker(gap, inside, base, insideBody)) { frozen.add(name); continue; }
    const prev = stages[only.stage - 1]?.words ?? [];
    const last = prev[prev.length - 1];
    if (last !== undefined && FOLLOW_KEYWORDS.has(last)) frozen.add(name);
  }
  return frozen;
};

const andOnly = (gap: string): boolean =>
  gap.includes("&&") && !gap.includes(";") && !gap.includes("||") && !gap.includes("\n");

type Track = {
  current: string;
  effective: string;
  missingSince: number | undefined;
  vars: Record<string, string>;
  dirStack: string[];
  effectiveStack: string[];
  missingStack: Array<number | undefined>;
  varStack: Array<Record<string, string>>;
};

const makeTrack = (cwd: string): Track => ({
  current: cwd,
  effective: cwd,
  missingSince: undefined,
  vars: {},
  dirStack: [],
  effectiveStack: [],
  missingStack: [],
  varStack: [],
});

const pushScope = (track: Track): void => {
  track.dirStack.push(track.current);
  track.effectiveStack.push(track.effective);
  track.missingStack.push(track.missingSince);
  track.varStack.push(track.vars);
  track.vars = { ...track.vars };
};

const popScope = (track: Track): void => {
  track.current = track.dirStack.pop() ?? track.current;
  track.effective = track.effectiveStack.pop() ?? track.effective;
  track.missingSince = track.missingStack.pop();
  track.vars = track.varStack.pop() ?? track.vars;
};

const applyGapParens = (track: Track, stage: SplitStage, base: number, inside: readonly boolean[], insideBody: (at: number) => boolean): void => {
  for (let offset = 0; offset < stage.gap.length; offset += 1) {
    const at = base + offset;
    if (inside[at] || insideBody(at)) continue;
    if (stage.gap[offset] === "(") pushScope(track);
    else if (stage.gap[offset] === ")") popScope(track);
  }
};

const applyCd = (track: Track, words: readonly string[], bare: readonly string[], piped: boolean, home: string, index: number): boolean => {
  if (bare[0] !== "cd") return false;
  if (piped) return true;
  const target = cdTarget(words, home);
  if (target === undefined) return true;
  track.current = resolve(track.current, target);
  if (!existsSync(track.current)) {
    track.missingSince = index;
    return true;
  }
  track.effective = track.current;
  track.missingSince = undefined;
  return true;
};

const recordExports = (track: Track, bare: readonly string[], piped: boolean): void => {
  if (piped) return;
  for (const word of bare.slice(1)) {
    const cut = word.indexOf("=");
    if (cut > 0) assign(track, word.slice(0, cut), word.slice(cut + 1));
  }
};

const isAssignmentStage = (words: readonly string[]): boolean => words.length > 0 && words.every((word) => LEADING_ASSIGNMENT.test(word));

const assign = (track: Track, name: string, value: string): void => {
  const held = track.vars[name];
  track.vars[name] = held === undefined || held === value ? value : UNRESOLVED;
};

const recordAssignments = (track: Track, words: readonly string[], piped: boolean): void => {
  if (piped) return;
  for (const word of words) {
    const cut = word.indexOf("=");
    assign(track, word.slice(0, cut), word.slice(cut + 1));
  }
};

const recordMktemp = (track: Track, command: string, stage: SplitStage, piped: boolean): boolean => {
  const made = mktempAssignment(command, stage);
  if (made === undefined) return false;
  if (!piped && !made.piped) assign(track, made.name, made.dir);
  return true;
};

const resolveFrom = (track: Track, index: number, stages: readonly SplitStage[]): string => {
  if (track.missingSince === undefined) return track.current;
  for (let at = track.missingSince + 1; at <= index; at += 1) {
    if (!andOnly(stages[at]?.gap ?? "")) return track.effective;
  }
  return track.current;
};

const commitDirFor = (track: Track, words: readonly string[], bare: readonly string[], index: number, stages: readonly SplitStage[], home: string): string | undefined => {
  const git = bare.indexOf("git");
  if (git === -1) return undefined;
  const commitAt = bare.indexOf("commit", git + 1);
  if (commitAt === -1) return undefined;
  return gitDirOf(words, bare, git, commitAt, resolveFrom(track, index, stages), track.vars, home);
};

const commitDirs = (stages: readonly SplitStage[], command: string, cwd: string, home: string): string[] => {
  const inside = quoted(command);
  const bodies = functionBodies(command);
  const insideBody = (at: number): boolean => bodies.some(({ from, to }) => at >= from && at < to);
  const track = makeTrack(cwd);
  for (const name of unstableVars(stages, command, inside, insideBody)) track.vars[name] = UNRESOLVED;
  const targets: string[] = [];
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    if (stage === undefined) continue;
    if (insideBody(stage.start)) continue;
    applyGapParens(track, stage, stage.start - stage.gap.length, inside, insideBody);
    const words = stage.words.map((word) => expandVars(word, track.vars));
    const bare = withoutEnv(words);
    const next = stages[index + 1];
    const piped = isPipeGap(stage.gap) || (next !== undefined && isPipeGap(next.gap));
    if (recordMktemp(track, command, stage, piped) || applyCd(track, words, bare, piped, home, index)) continue;
    if (bare[0] === "export") recordExports(track, bare, piped);
    else if (isAssignmentStage(words)) {
      recordAssignments(track, words, piped);
      continue;
    }
    const found = commitDirFor(track, words, bare, index, stages, home);
    if (found !== undefined) targets.push(found);
  }
  return targets;
};

const IDENTITY_KEYS = ["author.email=", "author.name=", "committer.email=", "committer.name=", "user.email=", "user.name="];

const hasIdentityKey = (value: string): boolean => IDENTITY_KEYS.some((key) => value.startsWith(key));

const spacedIdentityValue = (word: string, next: string): string | undefined => {
  if (word === "-c" || word === "--config" || word === "--config-env") return next;
  return undefined;
};

const joinedIdentityValue = (word: string): string | undefined => {
  if (word.startsWith("--config=") || word.startsWith("--config-env=")) return word.slice(word.indexOf("=") + 1);
  if (word.startsWith("-c") && word.length > 2) return word.slice(2);
  return undefined;
};

const wordSetsIdentity = (word: string, next: string): boolean => {
  if (word === "--author" || word.startsWith("--author=")) return true;
  const spaced = spacedIdentityValue(word, next);
  if (spaced !== undefined) return hasIdentityKey(spaced);
  const joined = joinedIdentityValue(word);
  return joined !== undefined && hasIdentityKey(joined);
};

const setsIdentity = (words: readonly string[]): boolean => {
  for (let at = 0; at < words.length; at += 1) {
    if (wordSetsIdentity(words[at] ?? "", words[at + 1] ?? "")) return true;
  }
  return false;
};

const SUDO_IDENTITY = new Set(["sudo", "doas"]);

const skipSudoFlags = (words: readonly string[], at: number): number => {
  let next = at;
  for (;;) {
    const flag = words[next] ?? "";
    if (flag === "-u" || flag === "--user" || flag === "-g" || flag === "--group") next += 2;
    else if (flag.startsWith("-") && flag !== "-") next += 1;
    else return next;
  }
};

const skipEnvFlags = (words: readonly string[], at: number): number => {
  let next = at;
  for (;;) {
    const flag = words[next] ?? "";
    if (flag === "-u" || flag === "--unset") next += 2;
    else if (flag.startsWith("--unset=")) next += 1;
    else if (flag.startsWith("-u") && flag.length > 2) next += 1;
    else if (flag.startsWith("-") && flag !== "-") next += 1;
    else return next;
  }
};

const exportsIdentity = (words: readonly string[]): boolean => {
  let at = 0;
  while (at < words.length && LEADING_ASSIGNMENT.test(words[at] ?? "")) at += 1;
  if (SUDO_IDENTITY.has(words[at] ?? "")) {
    at = skipSudoFlags(words, at + 1);
    while (at < words.length && LEADING_ASSIGNMENT.test(words[at] ?? "")) at += 1;
  }
  if (words.slice(0, at).some((word) => IDENTITY_VAR.test(word))) return true;
  if (words[at] === "export") return words.slice(at + 1).some((word) => IDENTITY_VAR.test(word));
  if (words[at] === "env") return words.slice(skipEnvFlags(words, at + 1)).some((word) => IDENTITY_VAR.test(word));
  const rest = words.slice(at);
  return rest.some((word, index) => IDENTITY_VAR.test(word) && (index === 0 || (rest[index - 1] ?? "").includes("=")));
};

export const commitIdentity = (tool: string, input: Record<string, unknown>, cwd: string): string | undefined => {
  if (tool.toLowerCase() !== "bash") return undefined;
  const command = input["command"];
  if (typeof command !== "string") return undefined;
  const stages = splitStages(command);
  const calls = stages.map((stage) => stage.words);
  const commits = calls.some((words) => {
    const git = words.indexOf("git");
    return git !== -1 && words.slice(git + 1).includes("commit");
  });
  if (!commits) return undefined;
  if (!calls.some((words) => setsIdentity(words) || exportsIdentity(words))) return undefined;
  const targets = commitDirs(stages, command, cwd, homedir());
  if (targets.length > 0 && targets.every(underTemp)) return undefined;
  return COMMIT_IDENTITY_REFUSAL;
};
