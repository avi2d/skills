import { russianProse } from "../../writing-judges";
import type { EvalCase } from "../fixture";
import { LEDGER, carriedTasks } from "./ledger";

export const RUSSIAN_PROSE: readonly EvalCase[] = carriedTasks("russian-prose", russianProse, [LEDGER.ruReadme, LEDGER.ruPr, LEDGER.ruSite, LEDGER.ruDocs]);
