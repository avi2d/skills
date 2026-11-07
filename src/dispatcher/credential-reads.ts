import { globSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, matchesGlob, resolve, sep } from "node:path";
import { simpleCommands } from "./job-queue";
import { segments } from "./shell-words";

const HOME = process.env.HOME ?? homedir();

type Env = Record<string, string | undefined>;

const ownedAuthHosts = (home: string, env: Env): readonly string[] => {
  const owned = [join(home, ".pi/agent/auth.json"), join(home, ".codex/auth.json"), join(home, ".config/gh/hosts.yml")];
  if (env.PI_CODING_AGENT_DIR) owned.push(join(env.PI_CODING_AGENT_DIR, "auth.json"));
  if (env.CODEX_HOME) owned.push(join(env.CODEX_HOME, "auth.json"));
  if (env.GH_CONFIG_DIR) owned.push(join(env.GH_CONFIG_DIR, "hosts.yml"));
  return owned;
};

const TUNNEL_DIRS = ["wireguard", "amneziawg"];

const GLOB = /[*?[{]/;

const WIREGUARD_SIZE = 64 * 1024;

const PATH_TOOLS: Readonly<Record<string, readonly string[]>> = {
  read: ["path", "file_path"],
  edit: ["path", "file_path"],
  multiedit: ["file_path"],
  grep: ["path"],
  ffgrep: ["path"],
  multi_grep: ["path"],
  "fff-multi-grep": ["path"],
};

const expanded = (word: string, home: string): string => word.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home);

function real(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

const isFile = (path: string): boolean => {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
  } catch {
    return false;
  }
};

function tunnelByName(path: string): boolean {
  const parts = path.split(sep);
  const lower = parts.map((part) => part.toLowerCase());
  const anchored = lower.some(
    (part, at) => part === "etc" && lower.slice(at + 1, -1).some((later) => TUNNEL_DIRS.includes(later)),
  );
  if (anchored) return true;
  const last = lower.at(-1) ?? "";
  const key = last === "privatekey" || last.endsWith(".key");
  return key && lower.slice(0, -1).some((part) => TUNNEL_DIRS.includes(part));
}

function wireguardConfig(path: string): boolean {
  if (!path.toLowerCase().endsWith(".conf")) return false;
  try {
    if (statSync(path).size > WIREGUARD_SIZE) return false;
    const text = readFileSync(path, "utf8");
    return /^\s*\[Interface\]/m.test(text) && /^\s*PrivateKey\s*=/m.test(text);
  } catch {
    return false;
  }
}

function credentialPath(path: string, home: string, env: Env): boolean {
  if (tunnelByName(path)) return true;
  const seen = [path, real(path) ?? path];
  if (seen.some((candidate) => {
    const base = basename(candidate).toLowerCase();
    return base === ".npmrc" || base === ".credentials.json";
  })) return true;
  const targets = ownedAuthHosts(home, env).flatMap((owned) => [owned, real(owned) ?? owned]);
  if (seen.some((candidate) => targets.includes(candidate))) return true;
  return seen.some(wireguardConfig);
}

const namedInShell = (path: string, home: string, env: Env): boolean =>
  isFile(path) && credentialPath(path, home, env);

const KEYS_FILTER = /^\s*(?:(?:\.[A-Za-z_][\w-]*)+\s*\|\s*)?keys(?:_unsorted)?\s*$/;

const KEYS_FLAGS = ["-r", "-c", "-M", "-S", "-C", "--raw-output", "--compact-output", "--sort-keys", "--monochrome-output", "--color-output"];

function keysOnly(words: readonly string[]): boolean {
  const [program = "", ...rest] = words;
  if (!["jq", "yq", "gojq"].includes(program)) return false;
  const flags = rest.filter((word) => word.startsWith("-"));
  const [filter = ""] = rest.filter((word) => !word.startsWith("-"));
  return flags.every((flag) => KEYS_FLAGS.includes(flag)) && KEYS_FILTER.test(filter);
}

const METADATA_ONLY = ["ls", "stat", "test", "[", "du", "file", "wc", "realpath", "readlink", "chmod", "chown", "touch", "rm"];

// The lexer leaves a quoted substitution or a backtick inside the segment it runs in.
const substitutes = (words: readonly string[]): boolean => words.some((word) => word.includes("$(") || word.includes("`"));

const printsNoValue = (words: readonly string[]): boolean =>
  !substitutes(words) && (METADATA_ONLY.includes(words[0] ?? "") || keysOnly(words));

const INPUT_REDIRECT = /(?<![<\d])\d?<(?![<(&])\s*("[^"]*"|'[^']*'|[^\s;&|()<>]+)/g;

const redirected = (command: string): string[] => [...command.matchAll(INPUT_REDIRECT)].map(([, target = ""]) => target.replace(/^(["'])(.*)\1$/, "$2"));

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function candidates(word: string): string[] {
  const value = word.startsWith("-") || ASSIGNMENT.test(word) ? word.split(/=(.*)/s)[1] : undefined;
  const pieces = /[\s`]/.test(word) ? word.split(/[\s'"`()=,;:<>|&]+/) : [];
  return [word, ...(value === undefined ? [] : [value]), ...pieces].filter((piece) => piece !== "");
}

const REFUSED_SAMPLES = [".npmrc", ".credentials.json", "auth.json", "hosts.yml", "privatekey", "sample.key", "sample.conf"];

function globMayRefuse(pattern: string): boolean {
  const last = pattern.split(/[\\/]/).at(-1) ?? pattern;
  return REFUSED_SAMPLES.some((sample) => {
    try {
      return matchesGlob(sample, last);
    } catch {
      return true;
    }
  });
}

function namedPaths(word: string, dirs: readonly string[], home: string): string[] {
  const path = expanded(word, home);
  return dirs.flatMap((dir) => {
    const at = resolve(dir, path);
    if (!GLOB.test(path) || !globMayRefuse(path)) return [at];
    try {
      const matched = globSync(path, { cwd: dir }).map((found) => resolve(dir, found));
      return matched.length > 0 ? matched : [at];
    } catch {
      return [at];
    }
  });
}

function inCommand(command: string, cwd: string, home: string, env: Env): string | undefined {
  const commands = simpleCommands(command);
  let current = cwd;
  const dirs = [cwd];
  for (const [program, ...rest] of commands) {
    if (program === "cd" || program === "pushd") {
      const target = rest.find((word) => !word.startsWith("-"));
      current = target === undefined ? home : resolve(current, expanded(target, home));
      dirs.push(current);
    }
  }
  const words = segments(command).flatMap((segment, at) => (printsNoValue(commands[at] ?? []) ? [] : segment.map(({ text }) => text)));
  for (const word of [...words, ...redirected(command)]) {
    for (const piece of candidates(word)) {
      const bare = expanded(piece, home);
      if (bare.includes(sep) || bare.includes("/")) {
        const direct = dirs.map((dir) => resolve(dir, bare)).find((path) => tunnelByName(path));
        if (direct !== undefined) return direct;
      }
      const found = namedPaths(piece, dirs, home).find((path) => namedInShell(path, home, env));
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function inPaths(paths: readonly string[], cwd: string, home: string, env: Env): string | undefined {
  return paths
    .map((path) => resolve(cwd, expanded(path.startsWith("@") ? path.slice(1) : path, home)))
    .find((path) => credentialPath(path, home, env));
}

export function credentialRead(tool: string, input: Record<string, unknown>, cwd: string, home = HOME, env: Env = process.env): string | undefined {
  const name = tool.toLowerCase();
  if (name === "bash") return typeof input.command === "string" ? inCommand(input.command, cwd, home, env) : undefined;
  const keys = PATH_TOOLS[name] ?? [];
  const paths = keys.flatMap((key) => {
    const value = input[key];
    return typeof value === "string" ? [value] : [];
  });
  return inPaths(paths, cwd, home, env);
}

export const refusedText = (path: string): string =>
  `This call reads ${path}, which holds a credential, and what a tool prints is kept in the session transcript as it stands. Inspect a credential file by its key names only, such as \`jq 'keys'\` on a JSON file, or ask the tool that owns it, such as \`gh auth status\`.`;

export const refusedLine = (path: string): string => `credential-read: refused a read of ${path}`;
