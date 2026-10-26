export const SECOND_MATE_HARNESS = "harness/firstmate/secondmate-harness";

export const SUPERVISION_BRANCH_MODEL = "harness/firstmate/supervision-branch-model";

export const SUPERVISION_BRANCH_EFFORT = "harness/firstmate/supervision-branch-effort";

export const FIRSTMATE_PINS: Readonly<Record<string, string>> = {
  [SECOND_MATE_HARNESS]: "pi claude-bridge/claude-haiku-5-5 high\n",
  [SUPERVISION_BRANCH_MODEL]: "opencode-go/muse-spark-1.3-contributor\n",
  [SUPERVISION_BRANCH_EFFORT]: "high\n",
};
