import { docShape, plainProse, plainSentences, type Check } from "../../writing-judges";
import type { EvalCase } from "../fixture";
import { LEDGER, README_SHAPE, ruleTasks } from "./ledger";
import { LEDGER_CHANGES } from "./ledger-changes";

const PLAIN_README: Check = (lines) => [...README_SHAPE(lines), ...plainProse(lines)];

const PLAIN_CHANGE: Check = (lines) => [...plainProse(lines), ...plainSentences(lines)];

const FLAG_README: Check = (lines) => [...docShape([/--dry-run/], false)(lines), ...PLAIN_CHANGE(lines)];

export const WRITING_FOR_PEOPLE: readonly EvalCase[] = ruleTasks("writing-for-people", [
  [LEDGER.enReadme, PLAIN_README],
  [LEDGER.ruReadme, PLAIN_README],
  [LEDGER.enPr, plainProse],
  [LEDGER.ruPr, plainProse],
  [LEDGER.enSite, plainProse],
  [LEDGER.ruSite, plainProse],
  [LEDGER.enErrors, plainProse],
  [LEDGER.ruErrors, plainProse],
  [LEDGER_CHANGES.enCommit, PLAIN_CHANGE],
  [LEDGER_CHANGES.enPrFix, PLAIN_CHANGE],
  [LEDGER_CHANGES.enReadmeFlag, FLAG_README],
  [LEDGER_CHANGES.enNews, PLAIN_CHANGE],
]);
