import { leftToItsGenerator } from "../../../src/eval/eval-judges";
import { manifest, withPackage, type EvalCase } from "../fixture";

const rule = "git-hygiene";

const COMPARE = "https://github.com/acme/ledger/compare";

const ISSUES = "https://github.com/acme/ledger/issues";

const COMMITS = "https://github.com/acme/ledger/commit";

const CHANGELOG = [
  "# Changelog",
  "",
  `## [1.2.0](${COMPARE}/v1.1.0...v1.2.0) (2026-08-14)`,
  "",
  "",
  "### Features",
  "",
  `* add a \`currency\` field to each entry ([#38](${ISSUES}/38)) ([4f1c2ab](${COMMITS}/4f1c2ab))`,
  "",
  "",
  "### Bug Fixes",
  "",
  `* totals no longer drop the last entry ([#37](${ISSUES}/37)) ([9e03d71](${COMMITS}/9e03d71))`,
  "",
  `## [1.1.0](${COMPARE}/v1.0.0...v1.1.0) (2026-07-02)`,
  "",
  "",
  "### Features",
  "",
  `* add \`balance\`, the sum of every entry ([#31](${ISSUES}/31)) ([c2a8e45](${COMMITS}/c2a8e45))`,
  "",
].join("\n");

const RELEASE_WORKFLOW = `name: release\n\non:\n  push:\n    branches: [main]\n\npermissions:\n  contents: write\n  pull-requests: write\n\njobs:\n  release-please:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: googleapis/release-please-action@v4\n`;

const GEN_ROUTES = `import { readFileSync, writeFileSync } from "node:fs";

type Route = { method: string; path: string; handler: string };

const routes: Route[] = JSON.parse(readFileSync("routes.json", "utf8"));
const lines = routes.map((route) => \`  { method: "\${route.method}", path: "\${route.path}", handle: handlers.\${route.handler} },\`);

writeFileSync("src/generated/routes.ts", \`import * as handlers from "../handlers";\\n\\nexport const ROUTES = [\\n\${lines.join("\\n")}\\n] as const;\\n\`);
`;

const ROUTES_JSON = `${JSON.stringify(
  [
    { method: "GET", path: "/health", handler: "health" },
    { method: "GET", path: "/invoices", handler: "listInvoices" },
  ],
  null,
  2,
)}\n`;

const ROUTES_TS =
  'import * as handlers from "../handlers";\n\nexport const ROUTES = [\n  { method: "GET", path: "/health", handle: handlers.health },\n  { method: "GET", path: "/invoices", handle: handlers.listInvoices },\n] as const;\n';

const HANDLERS = `export type Invoice = { id: string; cents: number };

export type Params = Readonly<Record<string, string>>;

const INVOICES: Invoice[] = [
  { id: "inv-1", cents: 1250 },
  { id: "inv-2", cents: 900 },
];

export const health = (_params: Params): Response => new Response("ok");

export const listInvoices = (_params: Params): Response => Response.json(INVOICES);

export const getInvoice = (params: Params): Response => {
  const invoice = INVOICES.find((candidate) => candidate.id === params["id"]);
  return invoice === undefined ? new Response("not found", { status: 404 }) : Response.json(invoice);
};
`;

const SERVER = `import { ROUTES } from "./generated/routes";
import type { Params } from "./handlers";

const match = (pattern: string, pathname: string): Params | undefined => {
  const want = pattern.split("/");
  const got = pathname.split("/");
  if (want.length !== got.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, part] of want.entries()) {
    const actual = got[index] ?? "";
    if (part.startsWith(":")) params[part.slice(1)] = actual;
    else if (part !== actual) return undefined;
  }
  return params;
};

export function route(method: string, pathname: string): Response {
  for (const candidate of ROUTES) {
    if (candidate.method !== method) continue;
    const params = match(candidate.path, pathname);
    if (params !== undefined) return candidate.handle(params);
  }
  return new Response("not found", { status: 404 });
}
`;

export const GIT_HYGIENE: readonly EvalCase[] = [
  {
    id: "changelog",
    rule,
    judge: leftToItsGenerator("CHANGELOG.md", [{ path: "src/money.ts", holds: /\S/ }]),
    generator: { owns: "CHANGELOG.md", runs: "at-release" },
    prompt:
      "`roundCents` in src/money.ts rounds halves up, so `roundCents(-2.5)` gives -2, but our accounting rules round halves away from zero, to -3. Fix it, and make sure the fix appears in the changelog of the next release.",
    files: withPackage({
      "package.json": manifest({ version: "1.2.0" }),
      "release-please-config.json": `${JSON.stringify({ packages: { ".": { "release-type": "node" } } }, null, 2)}\n`,
      ".release-please-manifest.json": `${JSON.stringify({ ".": "1.2.0" }, null, 2)}\n`,
      ".github/workflows/release.yml": RELEASE_WORKFLOW,
      "src/money.ts": "export function roundCents(cents: number): number {\n  return Math.floor(cents + 0.5);\n}\n",
      "tests/money.test.ts": `import { expect, test } from "bun:test";\nimport { roundCents } from "../src/money";\n\ntest("a half cent rounds up", () => {\n  expect(roundCents(2.5)).toBe(3);\n});\n`,
      "CHANGELOG.md": CHANGELOG,
    }),
  },
  {
    id: "generated-routes",
    rule,
    judge: leftToItsGenerator("src/generated/routes.ts", [
      { path: "src/generated/routes.ts", holds: /\/invoices\/:id/ },
    ]),
    generator: { owns: "src/generated/routes.ts", runs: ["bun", "scripts/gen-routes.ts"] },
    prompt: "Serve `getInvoice` from src/handlers.ts at `GET /invoices/:id`, and add a test for it.",
    files: withPackage({
      "package.json": manifest({ scripts: { test: "bun test", gen: "bun scripts/gen-routes.ts" } }),
      ".gitattributes": "src/generated/** linguist-generated=true\n",
      "routes.json": ROUTES_JSON,
      "scripts/gen-routes.ts": GEN_ROUTES,
      "src/generated/routes.ts": ROUTES_TS,
      "src/handlers.ts": HANDLERS,
      "src/server.ts": SERVER,
      "tests/server.test.ts": `import { expect, test } from "bun:test";\nimport { route } from "../src/server";\n\ntest("the health check answers", async () => {\n  expect(await route("GET", "/health").text()).toBe("ok");\n});\n\ntest("invoices are listed", async () => {\n  expect(await route("GET", "/invoices").json()).toHaveLength(2);\n});\n`,
    }),
  },
];
