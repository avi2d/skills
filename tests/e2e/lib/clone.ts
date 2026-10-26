import { generated } from "../../../src/generate/generate";
import { trackedFiles } from "./git";
import { valueOf } from "../../lib/effect";
import { HUB } from "../../lib/generated-root";

function withAncestors(paths: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const path of paths) {
    out.add(path);
    let directory = "";
    for (const segment of path.split("/").slice(0, -1)) {
      directory = directory ? `${directory}/${segment}` : segment;
      out.add(directory);
    }
  }
  return out;
}

export async function clonePaths(repo: string): Promise<Set<string>> {
  return withAncestors([
    ...(await trackedFiles(repo)),
    ...(await valueOf(generated(repo))).keys(),
    HUB,
  ]);
}
