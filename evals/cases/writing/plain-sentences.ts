import { plainSentences } from "../../writing-judges";
import type { EvalCase } from "../fixture";
import { LEDGER, carriedTasks } from "./ledger";

export const PLAIN_SENTENCES: readonly EvalCase[] = carriedTasks("plain-sentences", plainSentences, [LEDGER.enPr, LEDGER.enSite, LEDGER.ruPr, LEDGER.ruSite]);
