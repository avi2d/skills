import { punctuation } from "../../writing-judges";
import type { EvalCase } from "../fixture";
import { LEDGER, carriedTasks } from "./ledger";

export const PUNCTUATION: readonly EvalCase[] = carriedTasks("punctuation", punctuation, [LEDGER.enPr, LEDGER.enSite, LEDGER.ruPr, LEDGER.ruErrors]);
