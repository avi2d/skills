// A commit, fetch or push starts a detached git maintenance that writes into the repository after git returns, so removing the repository races it and the directory survives.
export const scratchGitEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "maintenance.auto",
  GIT_CONFIG_VALUE_0: "false",
};

export async function trackedFiles(repo: string): Promise<string[]> {
  return (await Bun.$`git ls-files -z`.cwd(repo).text()).split("\0").filter(Boolean);
}
