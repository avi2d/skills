import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, type Dirent } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import type { Standing } from "./forbid";
import { compileGlob } from "./glob";

const WALK_MAX_DEPTH = 4;

export const WALK_MAX_ENTRIES = 20_000;

export type WalkBounds = { maxDepth: number; maxEntries: number };

const WALK_BOUNDS: WalkBounds = { maxDepth: WALK_MAX_DEPTH, maxEntries: WALK_MAX_ENTRIES };

const SKIPPED = new Set([".git", "node_modules", "Library"]);

export type Listed = { files: string[]; capped: boolean };

export type Found = { files: string[]; tracked?: true; walked?: Listed };

export const cappedNote = (cwd: string): string =>
  `broken dispatcher: git ls-files failed in ${cwd}, and the fallback walk hit its cap of ${WALK_MAX_ENTRIES} entries before every glob matched, so repo-contains answered from a partial tree`;

function tracked(cwd: string): string[] | undefined {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\0").filter(Boolean);
  } catch {
    return undefined;
  }
}

function lexically(path: string): string | undefined {
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return relative(dir, path).split(sep).join("/");
    if (dirname(dir) === dir) return undefined;
  }
}

function resolved(path: string): string {
  const rest: string[] = [];
  for (let at = path; ; at = dirname(at)) {
    try {
      return join(realpathSync(at), ...rest);
    } catch {
      if (dirname(at) === at) return path;
      rest.unshift(basename(at));
    }
  }
}

// Lexical first rather than through `git rev-parse`, whose root is the real path: a file named through
// a symlinked directory would not sit under it. The real path is asked only when no repository holds
// the path as named, as for a harness's agent file linked into one.
const inRepository = (path: string): string | undefined => lexically(path) ?? lexically(resolved(path));

export const standing = (path: string): Standing => ({
  text: () => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  },
  inRepository: () => inRepository(path),
});

type Visit = { dir: string; prefix: string; depth: number };

type Walk = { files: string[]; unmatched: RegExp[]; visited: number };

function children(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch {
    return [];
  }
}

function record(walk: Walk, path: string): void {
  const still = walk.unmatched.filter((pattern) => !pattern.test(path));
  if (still.length < walk.unmatched.length) walk.files.push(path);
  walk.unmatched = still;
}

function subdirectory(kid: Dirent, current: Visit, path: string, maxDepth: number): Visit | undefined {
  if (!kid.isDirectory() || kid.isSymbolicLink() || SKIPPED.has(kid.name) || current.depth >= maxDepth) return undefined;
  return { dir: join(current.dir, kid.name), prefix: path, depth: current.depth + 1 };
}

function visit(current: Visit, walk: Walk, stack: Visit[], bounds: WalkBounds): Listed | undefined {
  for (const kid of children(current.dir)) {
    walk.visited += 1;
    const path = current.prefix === "" ? kid.name : `${current.prefix}/${kid.name}`;
    const into = subdirectory(kid, current, path, bounds.maxDepth);
    if (into) stack.push(into);
    else if (kid.isFile() || kid.isSymbolicLink()) record(walk, path);
    if (walk.unmatched.length === 0) return { files: walk.files, capped: false };
    if (walk.visited >= bounds.maxEntries) return { files: walk.files, capped: true };
  }
  return undefined;
}

export function walkFiles(cwd: string, globs: readonly string[], bounds: WalkBounds = WALK_BOUNDS): Listed {
  const walk: Walk = { files: [], unmatched: globs.map(compileGlob), visited: 0 };
  const stack: Visit[] = [{ dir: cwd, prefix: "", depth: 0 }];
  for (let current = stack.pop(); current !== undefined && walk.unmatched.length > 0; current = stack.pop()) {
    const ended = visit(current, walk, stack, bounds);
    if (ended) return ended;
  }
  return { files: walk.files, capped: false };
}

export function repoFiles(cwd: string, globs: readonly string[], recorded?: Listed): Found {
  if (globs.length === 0) return { files: [] };
  const files = tracked(cwd);
  if (files !== undefined) return { files, tracked: true };
  if (recorded) return { files: recorded.files };
  const walked = walkFiles(cwd, globs);
  return { files: walked.files, walked };
}
