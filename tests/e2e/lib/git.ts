export async function trackedFiles(repo: string): Promise<string[]> {
  return (await Bun.$`git ls-files -z`.cwd(repo).text()).split("\0").filter(Boolean);
}
