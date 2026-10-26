import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { settingsFrom } from "../../evals/settings";
import { unsandboxed } from "../../src/dispatcher/codex-dispatcher";
import { EVAL_CONCURRENCY_CAP, LOG_LINES, SEPARATE_CALLS, SEPARATE_EVAL_CALLS, queueFor, queued, simpleCommands, steer, steeredLine } from "../../src/dispatcher/job-queue";

const work = mkdtempSync(join(tmpdir(), "skills-job-queue-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));
for (const file of ["tests/unit/a.test.ts", "tests/unit/glob.test.ts", "tests/test_a.py", "src/a.test.ts", "src/foo.ts", "evals/vitest.config.ts", "setup.ts", "bunfig.ci.toml", ".env.test", "vitest.ci.ts", "pytest.ci.ini", "packages/a/a.test.ts", "sub/Cargo.toml", "sub/tests/b.test.ts", "tests/[id]/test_page.py"]) {
  mkdirSync(dirname(join(work, file)), { recursive: true });
  writeFileSync(join(work, file), "");
}

const q = (command: string): string | undefined => queueFor(command, work).join(" and ") || undefined;

describe("the tests group", () => {
  test.each(["bun test", "bun test --randomize", "bun test --randomize --seed=7"])(
    "%s runs every test file under the root, so it is the whole suite",
    (command) => {
      expect(q(command)).toBe("tests");
    },
  );

  test.each(["bun run test", "npm test", "npm run test", "pnpm test", "pnpm run test", "yarn test", "yarn run test", "bun run test -- --randomize"])(
    "%s is the repository's whole test script when nothing after it filters",
    (command) => {
      expect(q(command)).toBe("tests");
    },
  );

  test.each(["bun run mutate", "bun run mutate:incremental", "npm run mutate", "bun run mutate -- --mutate src/foo.ts", "pnpm mutate:incremental src/foo.ts"])(
    "%s runs the suite once per mutant, the heaviest test run a repository has, whatever it mutates",
    (command) => {
      expect(q(command)).toBe("tests");
    },
  );

  test.each(["stryker run", "npx stryker run --mutate src/a.ts", "./node_modules/.bin/stryker run"])(
    "%s runs the suite once per mutant even when it mutates one file",
    (command) => {
      expect(q(command)).toBe("tests");
    },
  );

  test.each(["bun test --timeout 20000", "bun test --timeout=20000 --seed 7 --randomize", "bun test --coverage-dir coverage --coverage", "bun run test -- --timeout 20000", "npm test -- --reporter dot"])(
    "%s carries option values but no path or test-name filter, so it is the whole suite",
    (command) => {
      expect(q(command)).toBe("tests");
    },
  );

  test.each(["vitest run", "vitest run --watch=false", "vitest run -w=false", "vitest run --no-watch", "bunx vitest run --reporter=dot", "vitest run --reporter dot --testTimeout 10000"])("%s runs every test file and exits", (command) => {
    expect(q(command)).toBe("tests");
  });

  test.each([
    ["bun test -r ./setup.ts", "bun test --preload ./setup.ts"],
    ["bun test --require ./setup.ts", "bun test --import ./setup.ts"],
    ["bun test -c bunfig.ci.toml", "bun test --config bunfig.ci.toml"],
    ["bun test --env-file .env.test", "bun test --cwd packages/a"],
    ["vitest run -c vitest.ci.ts", "vitest run --config vitest.ci.ts"],
    ["vitest run -r packages/a", "vitest run --root packages/a"],
    ["vitest run --dir packages/a", "vitest run --setupFiles ./setup.ts"],
    ["bun run test -- -c vitest.ci.ts", "npm test -- --preload ./setup.ts"],
    ["cargo test -m sub/Cargo.toml", "cargo test --manifest-path sub/Cargo.toml"],
    ["pytest -c pytest.ci.ini", "pytest --rootdir packages/a"],
  ])("%s and %s give an option its path, which is no target, so both are the whole suite", (short, long) => {
    expect([q(short), q(long)]).toEqual(["tests", "tests"]);
  });

  test.each([
    "bun test --parallel 2",
    "bun test --parallel=4",
    "bun test --bail 3",
    "bun test -d DEBUG:false",
    "vitest run --reporters dot",
    "vitest run --reporter dot",
    "vitest run --test-timeout 100",
    "vitest run -u all",
    "vitest run 'nothing/**/*.test.ts'",
    "cargo test -p core --features serde -j 4",
    "cargo test parses",
    "pytest -n 4 -m 'not slow'",
  ])("%s names nothing that exists, so every word after an option is that option's and it is the whole suite", (command) => {
    expect(q(command)).toBe("tests");
  });

  test.each(["cargo test", "cargo test --release", "cargo test -p core --features serde -- --test-threads 1", "pytest", "pytest -q", "pytest -n 4 -m 'not slow' -rA"])(
    "%s runs the crate's or the project's whole suite",
    (command) => {
      expect(q(command)).toBe("tests");
    },
  );
});

describe("the gpu group", () => {
  test.each(["llama-bench -m model.gguf", "llama-batched-bench -m model.gguf -npp 128"])("%s holds the GPU for the length of a benchmark", (command) => {
    expect(q(command)).toBe("gpu");
  });

  test.each(["ollama run qwen3 'say hi'", "ollama run --verbose qwen3 hello"])("%s loads a model onto the GPU and answers a prompt", (command) => {
    expect(q(command)).toBe("gpu");
  });

  test("ollama run with no prompt opens a chat that waits on a terminal a queued job never has", () => {
    expect(q("ollama run qwen3")).toBeUndefined();
  });
});

describe("the evals group", () => {
  test.each(["bun run eval", "npm run eval", "pnpm run eval", "yarn run eval", "pnpm eval", "yarn eval", "EVAL_CONCURRENCY=2 bun run eval", "OPENCODE_API_KEY=secret bun run eval"])(
    "%s runs the whole eval suite, which spends a sandboxed agent per run",
    (command) => {
      expect(q(command)).toBe("evals");
    },
  );

  test("the repository's eval script runs every eval, its config being an option's path and runner no path at all", () => {
    expect(q("vitest run --config evals/vitest.config.ts --configLoader runner")).toBe("evals");
  });

  test.each([
    "vitest run --config evals/vitest.config.ts",
    "vitest run -c evals/vitest.config.ts",
    "vitest run --config=evals/vitest.config.ts",
    "vitest run --config ./evals/vitest.config.ts",
    "bunx vitest run --config evals/vitest.config.ts",
  ])("%s runs the suite through the eval config, whatever wrapper or spelling names it", (command) => {
    expect(q(command)).toBe("evals");
  });

  test("a vitest run through any other config is a unit suite, not an eval", () => {
    expect(q("vitest run --config vitest.ci.ts")).toBe("tests");
  });

  test.each(["bun run eval evals/ablation.eval.ts", "bun run eval -t ablation", "bun run eval --changed", "npm run eval -- -t ablation", "vitest run --config evals/vitest.config.ts -t ablation"])(
    "%s still starts sandboxed agents however it filters, so it queues the same whichever way it is spelled",
    (command) => {
      expect(q(command)).toBe("evals");
    },
  );

  test.each(["vitest run --config evals/vitest.config.ts --watch", "vitest run -c evals/vitest.config.ts --watchAll", "bun run eval --watch", "npm run eval -- -w"])(
    "%s never exits, so a queued job would hold its slot forever",
    (command) => {
      expect(q(command)).toBeUndefined();
    },
  );
});

describe("model inference in the gpu group", () => {
  test.each([
    "rembg i in.png out.png",
    "rembg p in out",
    "whisper audio.mp3 --model base",
    "whisper-cli -m model.bin audio.wav",
    "whisper-cpp -m model.bin audio.wav",
  ])("%s runs model inference on the CPU or the GPU for the length of the call", (command) => {
    expect(q(command)).toBe("gpu");
  });

  test.each([
    "uvx rembg i in.png out.png",
    "uv run rembg i in.png out.png",
    "uv run --with rembg python -m whisper audio.mp3",
    "uv run python -m rembg i in.png out.png",
    "python -m rembg i in.png out.png",
    "python3 -m whisper audio.mp3",
    "uvx --from openai-whisper whisper audio.mp3",
    "uv run --extra gpu rembg i in.png out.png",
    "uvx --python 3.12 --index-strategy unsafe-best-match rembg i in.png out.png",
  ])("%s invokes a listed inference tool or module, so it holds the machine the same way", (command) => {
    expect(q(command)).toBe("gpu");
  });

  test.each([
    "uv run --with rembg script.py",
    "uv run -w 'rembg[gpu]>=2.0' remove_bg.py",
    "uv run --with=numpy,torch infer.py",
    "uv run --with llama_cpp_python python chat.py",
    "uv run --with faster-whisper --with numpy transcribe.py",
    "uv run --with transformers python caption.py",
    "uv run --env-file .env --with rembg remove_bg.py",
    "uv run --extra gpu --with rembg remove_bg.py",
    "uv run --index-url https://download.pytorch.org/whl/cpu --with torch infer.py",
    "uv run -C key=value --cache-dir /tmp/uv -w torch infer.py",
  ])("%s declares an inference package for the script it runs, so the script loads a model", (command) => {
    expect(q(command)).toBe("gpu");
  });

  test.each(["python train.py", "python remove_bg.py", "python -m pytest", "python -m llama_cpp server", "uv run script.py", "uv run --with numpy script.py", "uv run --with torch python -c 'import torch'", "uv run --with torch serve-model", "uvx ruff check ."])(
    "%s declares no inference package for a script and names no listed inference tool or module, and a script is never read, so it runs as it is",
    (command) => {
      expect(q(command)).toBeUndefined();
    },
  );
});

describe("a model run that never exits on its own", () => {
  test.each([
    "llama-server -m model.gguf",
    "rembg s",
    "rembg s --port 7000",
    "rembg b 1024 768",
    "rembg p -w in out",
    "rembg p --watch in out",
    "uvx rembg s",
    "uv run --with rembg rembg s",
    "python -m rembg s",
    "uv run --with llama-cpp-python python -m llama_cpp.server --model model.gguf",
  ])("%s serves or watches until stopped, so a queued job would hold the gpu slot forever", (command) => {
    expect(q(command)).toBeUndefined();
  });

  test.each([
    "llama-cli -m model.gguf",
    "llama-cli -m model.gguf -p 'say hi'",
    "llama-cli -m model.gguf -p 'say hi' -no-cnv",
    "llama-cli -m model.gguf -f prompt.txt",
    "llama-run qwen3",
    "llama-run qwen3 'say hi'",
    "llama-run --ngl 99 qwen3",
    "uvx llama-run qwen3 'say hi'",
    "uv run llama-cli -m model.gguf -p 'say hi'",
  ])(
    "%s can open a chat that waits on a stdin a queued job holds open, prompted or not",
    (command) => {
      expect(q(command)).toBeUndefined();
    },
  );
});

describe("what runs as it is", () => {
  test.each(["bun test tests/unit/glob.test.ts", "bun test --timeout 20000 tests/unit/glob.test.ts", "bun test --randomize tests/unit/glob.test.ts", "vitest run --coverage src/a.test.ts", "vitest run --no-isolate src/a.test.ts", "bun run test tests/unit/a.test.ts", "vitest run src/a.test.ts", "cargo test --test cli", "pytest tests/test_a.py", "pytest -n 4 tests/test_a.py", "pytest tests/test_a.py::test_x", "vitest run src/a.test.ts:12", "bun test 'tests/**/*.test.ts'", "bun run test -- --randomize tests/unit/a.test.ts", "pytest 'tests/[id]/test_page.py'"])(
    "%s names what it runs, so it is a quick targeted test",
    (command) => {
      expect(q(command)).toBeUndefined();
    },
  );

  test.each(["bun test --watch", "bun run test --watch", "vitest", "npm test -- -w", "vitest run -u --watch", "vitest run -c --watch", "vitest run -w=true", "vitest run --watch=true"])("%s never exits, so a queued job would hold its slot forever", (command) => {
    expect(q(command)).toBeUndefined();
  });

  test.each(["bun test -t 'a literal'", "bun test --test-name-pattern=one-small-test", "bun test --test-name-pattern one-small-test", "bun run test -- -t parses", "npm test -- --grep parses", "vitest run -t parses", "vitest run --test-name-pattern parses", "vitest run --tagsFilter slow", "pytest -k parses", "pytest -kparses"])(
    "%s filters by test name, so it is a quick targeted test",
    (command) => {
      expect(q(command)).toBeUndefined();
    },
  );

  test.each(["bun test --changed", "bun test --changed=main", "vitest run --changed"])("%s runs only the files a change affects, so it is a quick targeted test", (command) => {
    expect(q(command)).toBeUndefined();
  });

  test.each(["pueue add -- 'bun test'", "id=$(pueue add --print-task-id --group tests -- 'bun test') && pueue wait \"$id\""])(
    "%s hands the command to pueue as one quoted word, so nothing in it runs to be queued",
    (command) => {
      expect(q(command)).toBeUndefined();
    },
  );

  test.each(["ls", "git status", "bun run lint", "bun run typecheck", "bun install", "echo bun test", "grep -r 'bun test' docs"])(
    "%s is not a test suite or a GPU run",
    (command) => {
      expect(q(command)).toBeUndefined();
    },
  );
});

describe("reading the shell around a command", () => {
  test.each([
    ["cd sub && bun run test", "tests"],
    ["bun run lint && bun run test 2>&1 | tail -40", "tests"],
    ["bun run build; bun test", "tests"],
    ["CI=1 bun test", "tests"],
    ["env CI=1 bun test", "tests"],
    ["time bun run test", "tests"],
    ["timeout 600 bun run test", "tests"],
    ["timeout --signal=KILL 10m bun test", "tests"],
    ["bun test > out.txt 2>&1", "tests"],
    ["bun test &>/dev/null", "tests"],
    ["bun test # the whole suite", "tests"],
    ["(cd sub && bun test)", "tests"],
    ["bun test tests/b.test.ts", "tests"],
    ["cd sub && bun test tests/b.test.ts", undefined],
    ["cd -- sub && bun test tests/b.test.ts", undefined],
    ["(cd sub && bun test tests/b.test.ts); bun test tests/unit/a.test.ts", undefined],
    ["bun test --cwd sub tests/b.test.ts", undefined],
    ["env -C sub bun test tests/b.test.ts", undefined],
    ["bun test \\\n  --coverage", "tests"],
    ["nice -n 10 bun test", "tests"],
    ["nice -10 bun test", "tests"],
    ["timeout --signal KILL 600 bun test", "tests"],
    ["timeout -k 5 600 bun run test", "tests"],
    ["env -u NODE_OPTIONS bun test", "tests"],
    ["env -i CI=1 bun test", "tests"],
    ["npx -y stryker run", "tests"],
    ["npx --package @stryker-mutator/core stryker run", "tests"],
    ["bunx --bun vitest run", "tests"],
    ["pnpm exec --filter core vitest run", "tests"],
    ["pueue status && bun test", "tests"],
  ] as const)("%s queues in %s", (command, group) => {
    expect(q(command)).toBe(group);
  });

  test("a redirection target is not read as a path filter", () => {
    expect(simpleCommands("bun test >out.txt 2> err.txt")).toEqual([["bun", "test"]]);
  });

  test("a quoted argument is one word, quotes and all removed", () => {
    expect(simpleCommands(`ollama run qwen3 "say 'hi' twice"`)).toEqual([["ollama", "run", "qwen3", "say 'hi' twice"]]);
  });

  test("a heredoc's body is text the command reads, not commands the shell runs", () => {
    expect(q("cat <<'EOF' > notes.md\nbun test\nEOF\nls")).toBeUndefined();
    expect(simpleCommands("cat <<-EOF\n\tbun test\n\tEOF\nbun run test")).toEqual([["cat"], ["bun", "run", "test"]]);
  });
});

describe("the queued command", () => {
  test("it adds the command to the group whole, in one pair of single quotes, then waits and shows the log", () => {
    const wrapped = queued("bun run test", "tests");
    expect(wrapped).toContain("pueue add --print-task-id --group tests -- 'bun run test'");
    expect(wrapped).toContain('pueue wait --quiet --status success "$id"');
    expect(wrapped).toContain(`pueue log --lines ${LOG_LINES} "$id"`);
  });

  test("a single quote inside the command survives the quoting", () => {
    expect(queued("bun test -t 'it'", "tests")).toContain(`-- 'bun test -t '\\''it'\\'''`);
  });

  test("the queued command is itself a pueue call, so a hook that sees it again leaves it alone", () => {
    expect(q(queued("bun test", "tests"))).toBeUndefined();
  });

  test("the log line names the group and the action, and never the command, which can carry a credential", () => {
    expect(steeredLine({ type: "queue", group: "gpu", command: "API_TOKEN=secret llama-bench" })).toBe("job-queue gpu: queued the command through pueue");
    expect(steeredLine({ type: "refuse", groups: ["tests", "gpu"], text: SEPARATE_CALLS })).toBe("job-queue tests and gpu: refused a call that mixes groups");
  });

  test("the log line names the evals group the same way, and never the command", () => {
    expect(steeredLine({ type: "queue", group: "evals", command: "EVAL_CONCURRENCY=3 bun run eval" })).toBe("job-queue evals: queued the command through pueue");
    expect(steeredLine({ type: "refuse", groups: ["evals", "gpu"], text: SEPARATE_EVAL_CALLS })).toBe("job-queue evals and gpu: refused a call that mixes groups");
  });
});

describe("steer", () => {
  test("a heavy command queues in its group when pueue has that group", () => {
    expect(steer("bun test", work, () => ["default", "tests"])).toEqual({ type: "queue", group: "tests", command: queued("bun test", "tests") });
  });

  test("a heavy command runs as it is when pueue has no such group", () => {
    expect(steer("llama-bench -m m.gguf", work, () => ["default", "tests"])).toBeUndefined();
  });

  test("a bare eval run queues with EVAL_CONCURRENCY=3 added, since the harness default runs 4 abreast", () => {
    expect(steer("bun run eval", work, () => ["default", "tests", "gpu", "evals"])).toEqual({
      type: "queue",
      group: "evals",
      command: queued("EVAL_CONCURRENCY=3 bun run eval", "evals"),
    });
  });

  test.each([
    ["EVAL_CONCURRENCY=4 bun run eval", "EVAL_CONCURRENCY=3 bun run eval"],
    ["EVAL_CONCURRENCY=12 bun run eval", "EVAL_CONCURRENCY=3 bun run eval"],
    ["OPENCODE_API_KEY=secret EVAL_CONCURRENCY=8 bun run eval", "OPENCODE_API_KEY=secret EVAL_CONCURRENCY=3 bun run eval"],
  ])("%s asks for more runs than one slot lends, so it queues lowered to 3", (command, capped) => {
    expect(steer(command, work, () => ["default", "tests", "gpu", "evals"])).toEqual({ type: "queue", group: "evals", command: queued(capped, "evals") });
  });

  test.each([
    ["cd sub && bun run eval", "cd sub && EVAL_CONCURRENCY=3 bun run eval"],
    ["bun install && bun run eval", "bun install && EVAL_CONCURRENCY=3 bun run eval"],
    ["(bun run eval)", "(EVAL_CONCURRENCY=3 bun run eval)"],
    ["nice -n 10 bun run eval", "EVAL_CONCURRENCY=3 nice -n 10 bun run eval"],
    ["export EVAL_CONCURRENCY=8; bun run eval", "export EVAL_CONCURRENCY=8; EVAL_CONCURRENCY=3 bun run eval"],
    ['EVAL_CONCURRENCY="8" bun run eval', "EVAL_CONCURRENCY=3 bun run eval"],
    ["EVAL_CONCURRENCY='8' bun run eval", "EVAL_CONCURRENCY=3 bun run eval"],
    ["EVAL_CONCURRENCY=$N bun run eval", "EVAL_CONCURRENCY=3 bun run eval"],
    ["env EVAL_CONCURRENCY=8 bun run eval", "env EVAL_CONCURRENCY=3 bun run eval"],
    ["bun run eval; EVAL_CONCURRENCY=6 npm run eval", "EVAL_CONCURRENCY=3 bun run eval; EVAL_CONCURRENCY=3 npm run eval"],
    ["EVAL_CONCURRENCY=8 pnpm eval", "EVAL_CONCURRENCY=3 pnpm eval"],
    ["cd sub && yarn eval", "cd sub && EVAL_CONCURRENCY=3 yarn eval"],
  ])("%s caps the eval itself, wherever it sits in the call and however its count is spelled", (command, capped) => {
    expect(steer(command, work, () => ["default", "tests", "gpu", "evals"])).toEqual({ type: "queue", group: "evals", command: queued(capped, "evals") });
  });

  test.each(["EVAL_CONCURRENCY=3 bun run eval", "EVAL_CONCURRENCY=2 bun run eval", 'EVAL_CONCURRENCY="2" bun run eval'])("%s already fits one slot, so it queues as it is", (command) => {
    expect(steer(command, work, () => ["default", "tests", "gpu", "evals"])).toEqual({ type: "queue", group: "evals", command: queued(command, "evals") });
  });

  test("the harness default stays above the cap, so a bare run still needs the assignment", () => {
    expect(settingsFrom({}).concurrency).toBeGreaterThan(EVAL_CONCURRENCY_CAP);
  });

  test("an eval run passes through untouched where pueue has no evals group", () => {
    expect(steer("bun run eval", work, () => ["default", "tests", "gpu"])).toBeUndefined();
  });

  test.each(["bun run eval && bun run test", "bun run eval && llama-bench -m model.gguf"])(
    "%s needs the evals group and another, so it is refused with a word to run them as separate calls",
    (command) => {
      expect(steer(command, work, () => ["default", "tests", "gpu", "evals"])).toEqual({
        type: "refuse",
        groups: expect.arrayContaining(["evals"]),
        text: SEPARATE_EVAL_CALLS,
      });
    },
  );

  test.each(["bun test && llama-bench -m model.gguf", "llama-bench -m model.gguf && bun test"])(
    "%s needs two groups, which one queued job cannot hold, so it is refused with a word to run them as separate calls",
    (command) => {
      expect(steer(command, work, () => ["default", "tests", "gpu"])).toEqual({ type: "refuse", groups: expect.arrayContaining(["tests", "gpu"]), text: SEPARATE_CALLS });
    },
  );

  test("a call that needs two groups runs as it is when pueue lacks either of them", () => {
    expect(steer("bun test && llama-bench -m model.gguf", work, () => ["default", "tests"])).toBeUndefined();
    expect(steer("llama-bench -m model.gguf && bun test", work, () => ["default", "gpu"])).toBeUndefined();
  });

  test("two heavy commands in one group queue together as one job", () => {
    expect(steer("bun run lint && bun test && cargo test", work, () => ["tests"])).toEqual({ type: "queue", group: "tests", command: queued("bun run lint && bun test && cargo test", "tests") });
  });

  test("a heavy command runs as it is when pueue is missing or its daemon is down", () => {
    expect(steer("bun test", work, () => undefined)).toBeUndefined();
  });

  test("a quick command never asks pueue", () => {
    const asked: string[] = [];
    expect(
      steer("bun test tests/unit/a.test.ts", work, () => {
        asked.push("groups");
        return ["tests"];
      }),
    ).toBeUndefined();
    expect(asked).toEqual([]);
  });
});

describe("whether a Codex turn runs unsandboxed, since a queued job runs outside any sandbox", () => {
  const root = mkdtempSync(join(tmpdir(), "skills-sandbox-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const rollout = (...policies: Array<Record<string, unknown>>): string => {
    const path = join(root, `${policies.length}-${Math.random().toString(36).slice(2)}.jsonl`);
    const turns = policies.map((policy) => JSON.stringify({ type: "turn_context", payload: { sandbox_policy: policy } }));
    writeFileSync(path, [JSON.stringify({ type: "session_meta", payload: { id: "s1" } }), ...turns].join("\n"));
    return path;
  };

  test("full access is unsandboxed", () => {
    expect(unsandboxed({ transcript_path: rollout({ type: "danger-full-access" }) })).toBe(true);
  });

  test("a restricted sandbox is not, whatever its network setting", () => {
    expect(unsandboxed({ transcript_path: rollout({ type: "workspace-write", network_access: true }) })).toBe(false);
    expect(unsandboxed({ transcript_path: rollout({ type: "workspace-write", network_access: false }) })).toBe(false);
    expect(unsandboxed({ transcript_path: rollout({ type: "read-only" }) })).toBe(false);
  });

  test("the latest turn decides, because a session can change its sandbox between turns", () => {
    expect(unsandboxed({ transcript_path: rollout({ type: "danger-full-access" }, { type: "read-only" }) })).toBe(false);
  });

  test("an unreadable or absent rollout is not, so an unknown sandbox runs the command as it is", () => {
    expect(unsandboxed({ transcript_path: join(root, "missing.jsonl") })).toBe(false);
    expect(unsandboxed({})).toBe(false);
  });
});
