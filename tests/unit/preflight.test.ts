import { expect, test } from "bun:test";
import { loadFailures, outsideCheckout } from "../../src/generate/preflight";

test("the node_modules/.bin that bun run puts first for the checkout and each directory above it is dropped, and every other entry kept", () => {
  const repo = "/home/me/Projects/skills/";
  const path = [
    "/home/me/Projects/skills/node_modules/.bin",
    "/home/me/Projects/skills/src/node_modules/.bin/",
    "/home/me/Projects/node_modules/.bin",
    "/node_modules/.bin",
    "/home/me/.local/share/mise/installs/npm-pi/1.0.2/node_modules/.bin",
    "/home/me/Projects/skills-other/node_modules/.bin",
    "/usr/local/bin",
  ].join(":");
  expect(outsideCheckout(path, repo).split(":")).toEqual([
    "/home/me/.local/share/mise/installs/npm-pi/1.0.2/node_modules/.bin",
    "/home/me/Projects/skills-other/node_modules/.bin",
    "/usr/local/bin",
  ]);
});

test("each extension pi failed to load is named once, under ~ rather than the temporary home", () => {
  const home = "/tmp/skills-preflight-x/home";
  const stderr = [
    `Error: Failed to load extension "${home}/.pi/agent/extensions/session-name.ts": Failed to load extension: createCodemodeExtension is not a function`,
    `Error: Failed to load extension "${home}/.pi/agent/extensions/web-tools.ts": Failed to load extension: boom`,
    'Hint: Start without extensions using "pi -ne".',
    "",
  ].join("\n");
  expect(loadFailures(stderr, home)).toEqual([
    'Failed to load extension "~/.pi/agent/extensions/session-name.ts": Failed to load extension: createCodemodeExtension is not a function',
    'Failed to load extension "~/.pi/agent/extensions/web-tools.ts": Failed to load extension: boom',
  ]);
});
