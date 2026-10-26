import { plainWords } from "../../writing-judges";
import type { EvalCase } from "../fixture";
import { LEDGER, carriedTasks } from "./ledger";

export const PLAIN_WORDS: readonly EvalCase[] = carriedTasks("plain-words", plainWords, [LEDGER.enReadme, LEDGER.enPr, LEDGER.enSite, LEDGER.enErrors]);
