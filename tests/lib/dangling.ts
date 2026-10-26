import { posix } from "node:path";
import { stat } from "node:fs/promises";

export type Links = Readonly<Record<string, string>>;

export type Dangling = { link: string; target: string; why: "outside" | "absent-from-clone" | "missing" };

function escapes(target: string): boolean {
  return target.startsWith("/") || target === ".." || target.startsWith("../");
}

export function wouldDangle(links: Links, inClone: ReadonlySet<string>, resolved: ReadonlySet<string>): Dangling[] {
  return Object.entries(links).flatMap(([link, target]) => {
    const why = escapes(target)
      ? "outside"
      : !inClone.has(target)
        ? "absent-from-clone"
        : !resolved.has(target)
          ? "missing"
          : null;
    return why ? [{ link, target, why }] : [];
  });
}

export async function resolvedTargets(repo: string, links: Links): Promise<Set<string>> {
  const probed = await Promise.all(
    Object.values(links).map(async (target) => {
      const stats = await stat(posix.join(repo, target)).catch(() => null);
      return [target, stats] as const;
    }),
  );
  return new Set(probed.filter(([, stats]) => stats).map(([target]) => target));
}
