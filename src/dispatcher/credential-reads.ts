import { globSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { simpleCommands } from "./job-queue";
import { segments } from "./shell-words";

const HOME = process.env.HOME ?? homedir();

const NAMED = ["auth.json", "hosts.yml", ".credentials.json"];

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

const isFile = (path: string): boolean => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

function inTunnelDir(path: string): boolean {
  const parts = path.split(sep);
  const last = parts.at(-1) ?? "";
  if (!last.toLowerCase().endsWith(".conf") && !GLOB.test(last)) return false;
  return parts.slice(0, -1).some((part) => TUNNEL_DIRS.includes(part.toLowerCase()));
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

function credentialPath(path: string, home: string): boolean {
  if (inTunnelDir(path)) return true;
  const npmrc = join(home, ".npmrc");
  return [path, real(path) ?? path].some(
    (seen) => NAMED.includes(basename(seen)) || seen === npmrc || seen === real(npmrc) || wireguardConfig(seen),
  );
}

// A shell word is as often a pattern or a message as a path, and only root can stat a file in a tunnel directory.
const namedInShell = (path: string, home: string): boolean => inTunnelDir(path) || (isFile(path) && credentialPath(path, home));

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

function namedPaths(word: string, dirs: readonly string[], home: string): string[] {
  const path = expanded(word, home);
  return dirs.flatMap((dir) => {
    const at = resolve(dir, path);
    if (!GLOB.test(path)) return [at];
    try {
      const matched = globSync(path, { cwd: dir }).map((found) => resolve(dir, found));
      return matched.length > 0 ? matched : [at];
    } catch {
      return [at];
    }
  });
}

function inCommand(command: string, cwd: string, home: string): string | undefined {
  const commands = simpleCommands(command);
  const dirs = [cwd, ...commands.flatMap(([program, target]) => (program === "cd" && target !== undefined ? [resolve(cwd, expanded(target, home))] : []))];
  const words = segments(command).flatMap((segment, at) => (printsNoValue(commands[at] ?? []) ? [] : segment.map(({ text }) => text)));
  for (const word of [...words, ...redirected(command)]) {
    for (const piece of candidates(word)) {
      const found = namedPaths(piece, dirs, home).find((path) => namedInShell(path, home));
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function inPaths(paths: readonly string[], cwd: string, home: string): string | undefined {
  return paths
    .map((path) => resolve(cwd, expanded(path.startsWith("@") ? path.slice(1) : path, home)))
    .find((path) => credentialPath(path, home));
}

export function credentialRead(tool: string, input: Record<string, unknown>, cwd: string, home = HOME): string | undefined {
  const name = tool.toLowerCase();
  if (name === "bash") return typeof input.command === "string" ? inCommand(input.command, cwd, home) : undefined;
  const keys = PATH_TOOLS[name] ?? [];
  const paths = keys.flatMap((key) => {
    const value = input[key];
    return typeof value === "string" ? [value] : [];
  });
  return inPaths(paths, cwd, home);
}

export const refusedText = (path: string): string =>
  `This call reads ${path}, which holds a credential, and what a tool prints is kept in the session transcript as it stands. Inspect a credential file by its key names only, such as \`jq 'keys'\` on a JSON file, or ask the tool that owns it, such as \`gh auth status\`.`;

export const refusedLine = (path: string): string => `credential-read: refused a read of ${path}`;
