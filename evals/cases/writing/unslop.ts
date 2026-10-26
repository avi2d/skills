import { firstPerson, opensOnMechanism, plainOverview, plainPuffedOverview, unslop, type Check } from "../../writing-judges";
import { withPackage, type EvalCase } from "../fixture";
import { LEDGER, carriedTasks } from "./ledger";

const unslopPr: Check = (lines) => [...unslop(lines), ...firstPerson(lines)];

const unslopSite: Check = (lines) => [...unslop(lines), ...opensOnMechanism(lines)];

export const UNSLOP: readonly EvalCase[] = [
  {
    id: "copy-edit-overview",
    rule: "unslop",
    delivery: { kind: "reference", alongside: ["technical-writing", "plain-sentences", "plain-words", "punctuation"] },
    judge: plainOverview,
    prompt: "Copy-edit docs/overview.md for a human reader. Keep the file and command names accurate.",
    files: withPackage({
      "docs/overview.md":
        "# Importing Ledger Entries\n\nThe `bun run import` command serves as the entry point for loading ledger.csv (the export from your bank).\nEach row is validated by the importer, and duplicates are skipped.\n**Duplicates:** Duplicate rows are listed at the end of the run.\n",
    }),
  },
  {
    id: "copy-edit-puff",
    rule: "unslop",
    delivery: { kind: "reference", alongside: ["technical-writing", "plain-sentences", "plain-words", "punctuation"] },
    judge: plainPuffedOverview,
    prompt: "Copy-edit docs/overview.md for a human reader. Keep the file and command names accurate.",
    files: withPackage({
      "docs/overview.md":
        "# Why Ledger Stands Out\n\nLedger is a cutting-edge solution that serves as the backbone of your small business finances (simple to set up).\nEach transaction from ledger.csv is imported by running `bun run import`, and duplicates are skipped.\n**Why it matters:** experts say clean books are the foundation of growth, and the future looks bright.\n",
    }),
  },
  ...carriedTasks("unslop", unslopPr, [LEDGER.ruPr]),
  ...carriedTasks("unslop", unslopSite, [LEDGER.enSiteIndex]),
];
