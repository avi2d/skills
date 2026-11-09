import { releasePointer, whatGoesWhere } from "../../writing-judges";
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
  {
    id: "what-goes-where",
    rule,
    judge: whatGoesWhere,
    prompt: "A user asked for plugin support. The project refuses it: plugins hide data flow, which breaks the explicit over implicit principle. Record the refusal and the principle that decides it in the file that owns them.",
    files: withPackage({
      "AGENTS.md": "# Agent notes\n\nUse bun test to check changes.\n",
      "VISION.md": "# Vision\n\nLedger stays a small explicit tool.\n",
    }),
  },
];
