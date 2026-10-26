import { expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigProvider, Effect, Schema } from "effect";
import { REPO, install, preflight } from "../../src/generate/link";
import { valueOf } from "../lib/effect";
import { fakePi } from "./lib/fake-pi";

// Each test generates a tree or starts pi, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(60_000);

const PI = `${REPO}node_modules/.bin/pi`;

const PINNED_PI_VERSION = Schema.decodeSync(Schema.fromJsonString(Schema.Struct({ version: Schema.String })))(
  readFileSync(`${REPO}node_modules/@earendil-works/pi-coding-agent/package.json`, "utf8"),
).version;

const UNLOADABLE_ENTRY = "harness/pi/extensions/web-tools.ts";

// What an extension meets under a pi that exports no createCodemodeExtension.
const UNLOADABLE_EXTENSION = `const createCodemodeExtension = Reflect.get({}, "createCodemodeExtension");
export default function (pi) {
  createCodemodeExtension({ models: false })(pi);
}
`;

async function standIn(): Promise<{ repo: string; home: string; discard: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "skills-preflight-test-"));
  const repo = `${root}/repo/`;
  await mkdir(repo);
  const links: string[] = [];
  for (const name of await readdir(REPO)) {
    if (name === ".git" || name.startsWith("generated")) continue;
    if (name === "harness") {
      await cp(`${REPO}${name}`, `${repo}${name}`, { recursive: true });
      continue;
    }
    await symlink(`${REPO}${name}`, `${repo}${name}`);
    links.push(`${repo}${name}`);
  }
  const discard = async (): Promise<void> => {
    for (const link of links) await unlink(link);
    await rm(root, { recursive: true, force: true });
  };
  return { repo, home: `${root}/home`, discard };
}

test("a checkout whose extension pi cannot load is refused, naming the extension and its error, and $HOME is never written", async () => {
  const { repo, home, discard } = await standIn();
  try {
    await writeFile(`${repo}${UNLOADABLE_ENTRY}`, UNLOADABLE_EXTENSION);
    const installed = await valueOf(install(repo, home, PI));
    const reasons = installed.state === "refused" ? installed.reasons : expect.unreachable("the preflight let an unloadable extension through");
    expect(reasons.join("\n")).toMatch(/~\/\.pi\/agent\/extensions\/web-tools\.ts.*createCodemodeExtension is not a function/);
    expect(existsSync(home), "the link went ahead into $HOME after pi failed to load an extension").toBe(false);
  } finally {
    await discard();
  }
});

test("a checkout pi loads in full is linked into $HOME after the preflight", async () => {
  const { repo, home, discard } = await standIn();
  try {
    const installed = await valueOf(install(repo, home, PI));
    const linked = installed.state === "linked" ? installed : expect.unreachable(`the preflight refused: ${installed.reasons.join("; ")}`);
    expect(linked.load).toEqual({ state: "loaded", pi: { path: PI, version: PINNED_PI_VERSION } });
    expect(linked.outcomes.filter((o) => o.state === "refused")).toEqual([]);
    expect(existsSync(`${home}/.pi/agent/extensions/web-tools.ts`), "$HOME holds no link to web-tools").toBe(true);
  } finally {
    await discard();
  }
});

test("a pi that exits without loading any extension checked nothing, so the preflight refuses", async () => {
  const { pi, discard } = await fakePi("exit 0");
  try {
    expect(await valueOf(preflight(REPO, pi))).toEqual({
      state: "refused",
      pi: { path: pi, version: "of unknown version" },
      reasons: ["pi exited without loading any extension, so none was checked"],
    });
  } finally {
    await discard();
  }
});

test("the checkout's own pinned pi never stands in for an installed one", async () => {
  const env = Object.fromEntries(Object.entries(process.env).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])));
  const onlyCheckoutBins = ConfigProvider.fromEnv({ env: { ...env, PATH: `${REPO}node_modules/.bin:${REPO}tests/node_modules/.bin` } });
  const load = preflight(REPO, "pi").pipe(Effect.provideService(ConfigProvider.ConfigProvider, onlyCheckoutBins));
  expect(await valueOf(load)).toEqual({ state: "no-pi" });
});

test("a pi that fails without naming an extension is refused with what it said", async () => {
  const { pi, discard } = await fakePi('[ "$1" = --version ] && { echo 9.9.9; exit 0; }\necho "unknown option" >&2\nexit 3');
  try {
    expect(await valueOf(preflight(REPO, pi))).toEqual({ state: "refused", pi: { path: pi, version: "9.9.9" }, reasons: ["pi exited 3: unknown option"] });
  } finally {
    await discard();
  }
});
