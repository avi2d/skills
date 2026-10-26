import { releasePointer } from "../../writing-judges";
import { withPackage, type EvalCase } from "../fixture";

const rule = "agents-md-router";

export const AGENTS_MD_ROUTER: readonly EvalCase[] = [
  {
    id: "release-pointer",
    rule,
    judge: releasePointer,
    prompt: "Update AGENTS.md so an agent knows what to do when asked to cut a release. The release procedure is already in docs/release.md.",
    files: withPackage({
      "AGENTS.md": "# Agent notes\n\nUse bun test to check changes.\n",
      "docs/release.md": "# Cut a release\n\nRun bun run release:dry to inspect the release, then git tag the approved version.\n",
    }),
  },
];
