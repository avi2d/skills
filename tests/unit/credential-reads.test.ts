import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { credentialRead } from "../../src/dispatcher/credential-reads";

const home = mkdtempSync(join(tmpdir(), "skills-credential-reads-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));
const work = join(home, "work");

const TUNNEL = "[Interface]\nPrivateKey = fixture\nAddress = 10.0.0.2/32\n";
const files: Record<string, string> = {
  ".npmrc": "//registry.npmjs.org/:_authToken=fixture\n",
  ".pi/agent/auth.json": "{}",
  ".codex/auth.json": "{}",
  ".config/gh/hosts.yml": "github.com:\n",
  ".claude/.credentials.json": "{}",
  "vpn/office.conf": TUNNEL,
  "vpn/wg0.conf": TUNNEL,
  "wireguard/privatekey": "fixture\n",
  "wireguard/wg0.key": "fixture\n",
  "work/nginx.conf": "server {}\n",
  "work/notes.md": "auth.json is where pi keeps its token\n",
  "work/README.md": "",
  "work/.npmrc": "//registry.npmjs.org/:_authToken=fixture\n",
  "work/hosts.yml": "all:\n",
  "work/roles/wireguard/tasks/main.yml": "name: fixture\n",
};
for (const [file, text] of Object.entries(files)) {
  mkdirSync(dirname(join(home, file)), { recursive: true });
  writeFileSync(join(home, file), text);
}
symlinkSync(join(home, ".npmrc"), join(work, "npmrc-link"));

const read = (tool: string, input: Record<string, unknown>, env: Record<string, string | undefined> = {}): string | undefined =>
  credentialRead(tool, input, work, home, env);
const bash = (command: string, env: Record<string, string | undefined> = {}): string | undefined => read("Bash", { command }, env);
const readIn = (cwd: string, tool: string, input: Record<string, unknown>, env: Record<string, string | undefined> = {}): string | undefined =>
  credentialRead(tool, input, cwd, home, env);
const bashIn = (cwd: string, command: string, env: Record<string, string | undefined> = {}): string | undefined =>
  readIn(cwd, "Bash", { command }, env);

describe("a path tool", () => {
  test.each([
    ["read", { path: "~/.npmrc" }, ".npmrc"],
    ["Read", { file_path: join(home, ".pi/agent/auth.json") }, ".pi/agent/auth.json"],
    ["read", { path: "~/.codex/auth.json" }, ".codex/auth.json"],
    ["read", { path: "@~/.config/gh/hosts.yml" }, ".config/gh/hosts.yml"],
    ["Read", { file_path: "../.claude/.credentials.json" }, ".claude/.credentials.json"],
    ["read", { path: "../vpn/office.conf" }, "vpn/office.conf"],
    ["read", { path: ".npmrc" }, "work/.npmrc"],
    ["read", { path: "~/wireguard/privatekey" }, "wireguard/privatekey"],
    ["Edit", { file_path: "~/.npmrc", old_string: "a", new_string: "b" }, ".npmrc"],
    ["ffgrep", { pattern: "token", path: "~/.pi/agent/auth.json" }, ".pi/agent/auth.json"],
  ])("%s %j is refused, not let through because the name is spelled relative, with ~ or with pi's @", (tool, input, file) => {
    expect(read(tool, input)).toBe(join(home, file));
  });

  test("a read through a symlink to ~/.npmrc is refused, not judged by the link's own name", () => {
    expect(read("read", { path: "npmrc-link" })).toBe(join(work, "npmrc-link"));
  });

  test("an auth.json outside its owning directory passes, not refused for sharing the file name", () => {
    expect(read("read", { path: "/srv/app/auth.json" })).toBeUndefined();
  });

  test("a hosts.yml outside its owning directory passes, not refused for sharing the file name", () => {
    expect(read("read", { path: "hosts.yml" })).toBeUndefined();
  });

  test("a GH_CONFIG_DIR hosts.yml is refused at the moved location as well as the default one, not replaced", () => {
    const moved = join(home, "elsewhere/gh");
    mkdirSync(moved, { recursive: true });
    writeFileSync(join(moved, "hosts.yml"), "github.com:\n");
    expect(read("read", { path: join(moved, "hosts.yml") }, { GH_CONFIG_DIR: moved })).toBe(join(moved, "hosts.yml"));
    expect(read("read", { path: join(home, ".config/gh/hosts.yml") }, { GH_CONFIG_DIR: moved })).toBe(join(home, ".config/gh/hosts.yml"));
  });

  test("a file under /etc/wireguard is refused without reading it, since only root can", () => {
    expect(read("read", { path: "/etc/wireguard/wg0.conf" })).toBe("/etc/wireguard/wg0.conf");
    expect(read("read", { path: "/etc/amneziawg/awg0.conf" })).toBe("/etc/amneziawg/awg0.conf");
  });

  test("a nested amnezia path is refused, not let through for sitting below amnezia", () => {
    expect(read("read", { path: "/etc/amnezia/amneziawg/awg0.conf" })).toBe("/etc/amnezia/amneziawg/awg0.conf");
  });

  test("a homebrew etc tunnel path is refused, not let through for the prefix before etc", () => {
    expect(read("read", { path: "/opt/homebrew/etc/wireguard/wg0.conf" })).toBe("/opt/homebrew/etc/wireguard/wg0.conf");
  });

  test("a project role under a wireguard directory is allowed, not refused for the directory name", () => {
    expect(read("read", { path: "roles/wireguard/tasks/main.yml" })).toBeUndefined();
  });

  test.each([
    ["read", { path: "nginx.conf" }],
    ["read", { path: "README.md" }],
    ["read", { path: "/srv/app/auth.json" }],
    ["write", { path: "auth.json", content: "{}" }],
    ["fffind", { pattern: "auth.json" }],
  ])("%s %j passes, not refused for a conf with no private key, a project auth.json or a write", (tool, input) => {
    expect(read(tool, input)).toBeUndefined();
  });
});

describe("a shell command", () => {
  test.each([
    ["cat ~/.npmrc", ".npmrc"],
    ["cat $HOME/.npmrc", ".npmrc"],
    ["head -5 ~/.pi/agent/auth.json | tail -1", ".pi/agent/auth.json"],
    ["cd ~/.config/gh && cat hosts.yml", ".config/gh/hosts.yml"],
    ["jq . < ~/.claude/.credentials.json", ".claude/.credentials.json"],
    ["jq '.claudeAiOauth' ~/.claude/.credentials.json", ".claude/.credentials.json"],
    ["grep PrivateKey ../vpn/*.conf", "vpn/office.conf"],
    ["bash -c 'cat ~/.npmrc'", ".npmrc"],
    ["cat ~/.config/gh/hosts.yml", ".config/gh/hosts.yml"],
    ["cat .npmrc", "work/.npmrc"],
    ["cat ~/wireguard/privatekey", "wireguard/privatekey"],
    ["cd ~/.config && cd gh && cat hosts.yml", ".config/gh/hosts.yml"],
    ["cd && cat .codex/auth.json", ".codex/auth.json"],
    ["pushd ~/.config/gh && cat hosts.yml", ".config/gh/hosts.yml"],
    ["cp ~/.pi/agent/auth.json /tmp/a && cat /tmp/a", ".pi/agent/auth.json"],
    ['ls "$(cat ~/.npmrc)"', ".npmrc"],
    ["ls `cat ~/.npmrc`", ".npmrc"],
    ["jq 'keys' \"$(cat ~/.npmrc)\"", ".npmrc"],
  ])("%s is refused, not let through behind a pipe, a cd, a redirect, a glob or a nested shell", (command, file) => {
    expect(bash(command)).toBe(join(home, file));
  });

  test("sudo cat on a tunnel config is refused though the caller cannot stat it", () => {
    expect(bash("sudo cat /etc/wireguard/wg0.conf")).toBe("/etc/wireguard/wg0.conf");
  });

  test("cat on a tunnel private key is refused without stat, not let through for missing conf suffix", () => {
    expect(bash("cat /etc/wireguard/privatekey")).toBe("/etc/wireguard/privatekey");
  });

  test("cat on a nested amnezia config is refused, not let through for sitting below amnezia", () => {
    expect(bash("cat /etc/amnezia/amneziawg/awg0.conf")).toBe("/etc/amnezia/amneziawg/awg0.conf");
  });

  test("cat on a tunnel config named by glob is refused, not let through for the star", () => {
    expect(bash("cat ~/vpn/wg*.conf")).toBe(join(home, "vpn/wg0.conf"));
  });

  test("cat on a tunnel config named by single-character glob is refused, not let through for the mark", () => {
    expect(bash("cat ~/vpn/w?0.conf")).toBe(join(home, "vpn/wg0.conf"));
  });

  test("cat on tunnel configs named by braces is refused, not let through for the list", () => {
    expect(bash("cat ~/vpn/{wg0,wg1}.conf")).toBe(join(home, "vpn/wg0.conf"));
  });

  test("cat on a tunnel key named by glob is refused, not let through for the mark", () => {
    expect(bashIn(join(home, "wireguard"), "cat wg0.k?y")).toBe(join(home, "wireguard/wg0.key"));
  });

  test("commands inside a wireguard directory pass, not refused for the directory name", () => {
    const cwd = join(home, "wireguard");
    expect(bashIn(cwd, "git status")).toBeUndefined();
    expect(bashIn(cwd, "bun test")).toBeUndefined();
  });

  test("ls after cd into a tunnel directory passes, not refused for naming no file", () => {
    expect(bash("cd /etc/wireguard && ls")).toBeUndefined();
  });

  test("a moved and a default credentials file are both refused, not replaced by the move", () => {
    const main = join(home, ".claude-accounts/main");
    mkdirSync(main, { recursive: true });
    writeFileSync(join(main, ".credentials.json"), "{}");
    expect(bash("cat ~/.claude/.credentials.json", { CLAUDE_CONFIG_DIR: main })).toBe(join(home, ".claude/.credentials.json"));
    expect(bash(`cat ${main}/.credentials.json`, { CLAUDE_CONFIG_DIR: main })).toBe(join(main, ".credentials.json"));
  });

  test("a default codex auth is refused while CODEX_HOME points elsewhere, not replaced", () => {
    expect(bash("cat ~/.codex/auth.json", { CODEX_HOME: join(home, "elsewhere/codex") })).toBe(join(home, ".codex/auth.json"));
  });

  test.each([
    ["git add hosts.yml", "does not refuse a project inventory the command never prints"],
    ["git diff hosts.yml", "does not refuse a project inventory the command never prints"],
    ["ansible-playbook -i hosts.yml site.yml", "does not refuse a project inventory passed as an inventory flag"],
  ])("%s passes, %s", (command) => {
    expect(bash(command)).toBeUndefined();
  });

  test.each([
    "jq 'keys' ~/.pi/agent/auth.json",
    "jq -r '.github | keys' ~/.pi/agent/auth.json",
    "yq 'keys' ~/.config/gh/hosts.yml",
    "gh auth status",
    "ls -la ~/.pi/agent",
    "ls -l ~/.pi/agent/auth.json && jq 'keys' ~/.pi/agent/auth.json",
    "stat ~/.npmrc",
    "test -f ~/.config/gh/hosts.yml && echo present",
    "grep -rn auth.json notes.md",
    "git commit -m 'read auth.json by key names only'",
    "cat nginx.conf",
    "echo hosts.yml",
  ])("%s passes, not refused for naming a credential file it does not read or for listing only its keys", (command) => {
    expect(bash(command)).toBeUndefined();
  });

  test("a long quoted commit message passes, not blocked on a stat error", () => {
    expect(bash(`git commit -m 'feat: x\n\n${"This change makes the dispatcher refuse reads. ".repeat(20)}'`)).toBeUndefined();
  });

  test("a word under a root-only directory passes, not blocked on a stat error", () => {
    expect(bash("ls /root/.bashrc")).toBeUndefined();
  });
});
