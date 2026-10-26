import type { EvalCase } from "../fixture";
import { LEDGER, PAGE_SHAPE, README_SHAPE, type LedgerTask } from "./ledger";
import { judgedBy, type Check } from "../../writing-judges";
import { both, noInvention } from "../../writing-invention";

const technical = (path: string, check: Check, tasks: readonly LedgerTask[]): EvalCase[] =>
  tasks.map(({ written, ...task }) => ({
    ...task,
    rule: "technical-writing",
    delivery: { kind: "carried" },
    judge: judgedBy("technical-writing", both(check, noInvention(task.files, path)), written),
  }));

export const TECHNICAL_WRITING: readonly EvalCase[] = [
  ...technical("README.md", README_SHAPE, [LEDGER.enReadme, LEDGER.ruReadme]),
  ...technical("docs/import.md", PAGE_SHAPE, [LEDGER.enDocs, LEDGER.ruDocs]),
];
