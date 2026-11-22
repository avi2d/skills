import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { queueFor, queued, steer } from "../../src/dispatcher/job-queue";

const work = mkdtempSync(join(tmpdir(), "skills-job-queue-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));
for (const file of ["tests/unit/a.test.ts", "tests/unit/glob.test.ts", "tests/test_a.py", "src/a.test.ts", "src/foo.ts", "bench/runner.config.ts", "setup.ts", "bunfig.ci.toml", ".env.test", "vitest.ci.ts", "pytest.ci.ini", "packages/a/a.test.ts", "sub/Cargo.toml", "sub/tests/b.test.ts", "tests/[id]/test_page.py"]) {
  mkdirSync(dirname(join(work, file)), { recursive: true });
  writeFileSync(join(work, file), "");
}

writeFileSync(join(work, ".skills.json"), JSON.stringify({ agentTests: { testScripts: ["bin/run-checks.sh", "bin/*.test.sh"], evalConfigs: ["bench/runner.config.ts"] } }));

const q = (command: string): string | undefined => queueFor(command, work).join(" and ") || undefined;

describe("repository settings", () => {
  test("unconfigured paths do not inherit another repository settings", () => {
    const other = join(work, "other");
    mkdirSync(other, { recursive: true });
    expect(queueFor("sh bin/worker.test.sh", other)).toEqual([]);
    expect(queueFor("vitest run -c bench/runner.config.ts", other)).toEqual(["tests"]);
  });
  test("rejects applying another repository settings through env -C", () => {
    const plain = join(work, "plain");
    mkdirSync(plain, { recursive: true });
    expect(queueFor("env -C " + plain + " vitest run -c bench/runner.config.ts", work)).toEqual(["tests"]);
    expect(queueFor("env -C " + plain + " sh bin/worker.test.sh", work)).toEqual([]);
  });
  test("rejects applying another repository settings through a prefixed env -C", () => {
    const elsewhere = join(work, "elsewhere");
    mkdirSync(elsewhere, { recursive: true });
    expect(queueFor("CI=1 env -C " + elsewhere + " vitest run -c bench/runner.config.ts", work)).toEqual(["tests"]);
    expect(queueFor("nice -n 10 env -C " + elsewhere + " sh bin/worker.test.sh", work)).toEqual([]);
  });
  test("rejects applying another repository settings after cd", () => {
    const configured = join(work, "configured");
    mkdirSync(configured, { recursive: true });
    writeFileSync(join(configured, ".skills.json"), JSON.stringify({ agentTests: { testScripts: [], evalConfigs: ["bench/runner.config.ts"] } }));
    expect(queueFor("cd " + configured + " && vitest run -c bench/runner.config.ts", work)).toEqual(["tests"]);
    expect(queueFor("cd " + work + " && vitest run -c bench/runner.config.ts", configured)).toEqual(["tests"]);
  });
});

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

  test.each(["bunx checks-test", "checks-test --changed", "bunx checks-test --changed", "bunx checks-test -t slow-report"])(
    "%s queues whatever it filters by, because --changed can widen to the whole suite",
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
    expect(q("vitest run --config bench/runner.config.ts --configLoader runner")).toBe("evals");
  });

  test.each([
    "vitest run --config bench/runner.config.ts",
    "vitest run -c bench/runner.config.ts",
    "vitest run --config=bench/runner.config.ts",
    "vitest run --config ./bench/runner.config.ts",
    "bunx vitest run --config bench/runner.config.ts",
  ])("%s runs the suite through the eval config, whatever wrapper or spelling names it", (command) => {
    expect(q(command)).toBe("evals");
  });

  test("a vitest run through any other config is a unit suite, not an eval", () => {
    expect(q("vitest run --config vitest.ci.ts")).toBe("tests");
  });

  test.each(["bun run eval evals/ablation.eval.ts", "bun run eval -t ablation", "bun run eval --changed", "npm run eval -- -t ablation", "vitest run --config bench/runner.config.ts -t ablation"])(
    "%s still starts sandboxed agents however it filters, so it queues the same whichever way it is spelled",
    (command) => {
      expect(q(command)).toBe("evals");
    },
  );

  test.each(["vitest run --config bench/runner.config.ts --watch", "vitest run -c bench/runner.config.ts --watchAll", "bun run eval --watch", "npm run eval -- -w"])(
    "%s never exits, so a queued job would hold its slot forever",
    (command) => {
      expect(q(command)).toBeUndefined();
    },
  );
});

describe("the heavy shapes the queue plan adds", () => {
  test.each([
    "checks-test",
    "checks-test --changed",
    "bin/run-checks.sh",
    "./bin/run-checks.sh",
    "bin/worker.test.sh",
    "sh bin/worker.test.sh",
    "go test ./...",
    "go test -run TestFoo ./...",
    "bin/lint",
    "./bin/typecheck",
    "bin/build",
    "sh bin/lint",
    "bun run test:fast",
    "npm run test:fast",
    "pnpm run test:fast",
    "yarn run test:fast",
    "xcrun simctl boot 1234-ABCD",
    "xcrun simctl io booted screenshot screen.png",
    "fm-sim-boot.sh",
  ])(
    "%s queues with priority in the tests group instead of running directly",
    (command) => {
      expect(steer(command, work, () => ["default", "tests"])).toEqual({ type: "queue", group: "tests", command: queued(command, "tests", 1) });
    },
  );

  test.each([
    "./scripts/smoke.test.sh",
    "scripts/run-checks.sh",
    "sub/dir/worker.test.sh",
    "sh scripts/worker.test.sh",
    "lint",
    "bun run lint",
    "npm run typecheck",
    "pnpm run build",
  ])(
    "%s names no queued shape, so it runs as it is",
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
