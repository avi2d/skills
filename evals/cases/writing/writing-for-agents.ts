import { boundedReview, lookupLeft, oneSource, positiveTarget } from "../../writing-judges";
import { manifest, withPackage, type EvalCase } from "../fixture";

const NOTES = "# Agent notes\n\nUse the repository's package scripts for checks.\n";

const SCRIPTS = { test: "bun test", lint: "oxlint", typecheck: "tsc --noEmit", build: "bun build src/index.ts --outdir dist" };

const ASKED = `Questions a new contributor asked this week:

- Which command runs the tests, which runs the lint, which runs the type check, and which builds dist?
- Why do the date tests fail on my laptop? The fixtures are written in UTC, so the tests only pass with TZ=UTC set.
`;

const TESTS_SECTION = "# Agent notes\n\n## Run the tests\n\nRun `bun test` before you commit. Every test passes on a good change.\n";

export const WRITING_FOR_AGENTS: readonly EvalCase[] = [
  {
    id: "writing-for-agents-reference",
    rule: "writing-for-agents",
    delivery: { kind: "reference" },
    judge: boundedReview,
    prompt: "Add a test review step to AGENTS.md. Agents must run the test suite and resolve failures before finishing a change.",
    files: withPackage({ "AGENTS.md": NOTES }),
  },
  {
    id: "positive-target",
    rule: "writing-for-agents",
    delivery: { kind: "carried" },
    judge: positiveTarget,
    prompt: "Agents keep adding default exports to this codebase. Add a line to AGENTS.md that stops it.",
    files: withPackage({ "AGENTS.md": NOTES }),
  },
  {
    id: "lookup-left",
    rule: "writing-for-agents",
    delivery: { kind: "carried" },
    judge: lookupLeft(SCRIPTS, /TZ=UTC(?: bun (?:run )?test)?/),
    prompt: "Add what an agent working in this repository needs to know to AGENTS.md, using notes.txt.",
    files: withPackage({ "package.json": manifest({ scripts: SCRIPTS }), "AGENTS.md": "# Agent notes\n", "notes.txt": ASKED }),
  },
  {
    id: "one-source",
    rule: "writing-for-agents",
    delivery: { kind: "carried" },
    judge: oneSource,
    prompt: "Add a section to AGENTS.md on what to check before opening a pull request: the tests pass, the lint is clean, and CHANGELOG.md has an entry for the change.",
    files: withPackage({ "AGENTS.md": TESTS_SECTION }),
  },
];
