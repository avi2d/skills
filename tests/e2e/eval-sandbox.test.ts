import { expect, test } from "bun:test";
import { Duration, Effect, FileSystem } from "effect";
import { GIT_HYGIENE } from "../../evals/cases/utility/git-hygiene";
import { GIT_HYGIENE_CO_AUTHOR } from "../../evals/cases/utility/git-hygiene-co-author";
import { noCoAuthorTrailer, verdictOf, type AgentRun } from "../../src/eval/eval-judges";
import { commitsIn, generatedBy, seeded, type Generator, type Seeded } from "../../src/eval/eval-sandbox";
import { valueOf } from "../lib/effect";

const spawnTimeoutMs = 30_000;

const seedOf = (id: string): Readonly<Record<string, string>> => [...GIT_HYGIENE, ...GIT_HYGIENE_CO_AUTHOR].find((c) => c.id === id)?.files ?? expect.unreachable(`the ${id} case`);

const inSandbox = <A, E, R>(files: Readonly<Record<string, string>>, after: (seed: Seeded, sh: (script: string) => void) => Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const seed = yield* seeded(files, "", process.env, []);
      const sh = (script: string): void => {
        const ran = Bun.spawnSync(["sh", "-c", script], { cwd: seed.sandbox.repo, env: seed.env });
        expect(ran.exitCode, ran.stderr.toString()).toBe(0);
      };
      return yield* after(seed, sh);
    }),
  );

const COMMIT = "git -c user.name=agent -c user.email=agent@example.invalid commit -q";

const committed = (message: string): Promise<string[]> =>
  valueOf(
    inSandbox(seedOf("co-author"), (seed, sh) => {
      sh(`printf '%s' '${message}' > "$TMPDIR/msg.txt" && echo x >> src/slug.ts && git add -A && ${COMMIT} -F "$TMPDIR/msg.txt"`);
      return commitsIn(seed);
    }),
  );

const judged = (commits: string[]): AgentRun => ({ transcript: { steps: [], answer: "", input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, requests: [], cost: 0, providerError: undefined, unreadable: 0 }, changes: [], commits, generated: {} });

test("a reference is readable from the agent's skill directory but absent from the task's git tree", async () => {
  const found = await valueOf(Effect.scoped(Effect.gen(function* () {
    const seed = yield* seeded({ "README.md": "# Task\n" }, "", process.env, [], { unslop: "---\nname: unslop\ndescription: Edit prose.\n---\n\n# Unslop\n" });
    const fs = yield* FileSystem.FileSystem;
    return {
      reference: yield* fs.readFileString(`${seed.sandbox.agentDir}/skills/unslop/SKILL.md`),
      inRepo: yield* fs.exists(`${seed.sandbox.repo}/.pi/agent/skills/unslop/SKILL.md`),
    };
  })));
  expect(found).toEqual({ reference: "---\nname: unslop\ndescription: Edit prose.\n---\n\n# Unslop\n", inRepo: false });
});

test("the commits a run made are read back from the sandbox, and the trailer judge fails the one carrying a trailer", async () => {
  const credited = await committed("Fix slugify\n\nCo-Authored-By: pi <pi@example.invalid>\n");
  expect(credited).toEqual(["Fix slugify\n\nCo-Authored-By: pi <pi@example.invalid>\n"]);
  expect(verdictOf(noCoAuthorTrailer, judged(credited)).outcome).toBe("fail");
  const plain = await committed("Fix slugify\n");
  expect(plain).toEqual(["Fix slugify\n"]);
  expect(verdictOf(noCoAuthorTrailer, judged(plain)).outcome).toBe("pass");
}, { timeout: spawnTimeoutMs });

test("an agent's plain git commit lands, because the sandbox repository names an author as a developer's checkout does", async () => {
  const commits = await valueOf(
    inSandbox(seedOf("co-author"), (seed, sh) => {
      sh("echo x >> src/slug.ts && git commit -qam 'Fix slugify'");
      return commitsIn(seed);
    }),
  );
  expect(commits).toEqual(["Fix slugify\n"]);
}, { timeout: spawnTimeoutMs });

test("a run that commits nothing leaves no commit to read back", async () => {
  expect(await valueOf(inSandbox(seedOf("co-author"), (seed) => commitsIn(seed)))).toEqual([]);
});

const ROUTES_GENERATOR = GIT_HYGIENE.find((c) => c.id === "generated-routes")?.generator ?? expect.unreachable("the generated-routes generator");

test("the generator runs on the sources the run left, and its output is read back", async () => {
  const files = seedOf("generated-routes");
  const [untouched, regenerated] = await valueOf(
    inSandbox(files, (seed, sh) =>
      Effect.gen(function* () {
        const before = yield* generatedBy(seed, ROUTES_GENERATOR, files);
        sh(`bun -e 'const r = JSON.parse(await Bun.file("routes.json").text()); r.push({ method: "GET", path: "/invoices/:id", handler: "getInvoice" }); await Bun.write("routes.json", JSON.stringify(r))'`);
        return [before, yield* generatedBy(seed, ROUTES_GENERATOR, files)] as const;
      }),
    ),
  );
  expect(untouched).toEqual({ "src/generated/routes.ts": files["src/generated/routes.ts"] ?? expect.unreachable("the seeded routes") });
  expect(regenerated["src/generated/routes.ts"]).toContain('{ method: "GET", path: "/invoices/:id", handle: handlers.getInvoice },');
}, { timeout: spawnTimeoutMs });

test("a generator run only at release produces the file as seeded", async () => {
  const files = seedOf("changelog");
  const released: Generator = GIT_HYGIENE.find((c) => c.id === "changelog")?.generator ?? expect.unreachable("the changelog generator");
  const output = await valueOf(inSandbox(files, (seed, sh) => (sh("echo '- Fixed rounding' >> CHANGELOG.md"), generatedBy(seed, released, files))));
  expect(output).toEqual({ "CHANGELOG.md": files["CHANGELOG.md"] ?? expect.unreachable("the seeded changelog") });
}, { timeout: spawnTimeoutMs });

test("a generator that outlasts its budget produces nothing, so the run goes unjudged", async () => {
  const started = Date.now();
  const hung: Generator = { owns: "src/generated/routes.ts", runs: ["sleep", "30"] };
  const output = await valueOf(inSandbox(seedOf("generated-routes"), (seed) => generatedBy(seed, hung, {}, Duration.millis(300))));
  expect(output).toEqual({});
  expect(Date.now() - started).toBeLessThan(10_000);
});
