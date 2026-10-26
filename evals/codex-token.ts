import type { ProviderConfig } from "@earendil-works/pi-coding-agent";

const tokenEnv = "OPENAI_ACCESS_TOKEN";

export default function codexToken(pi: { registerProvider(name: string, config: ProviderConfig): void }): void {
  if (process.env[tokenEnv] === undefined || process.env[tokenEnv] === "") {
    throw new Error("Missing " + tokenEnv + ": export the access token under openai in pi's auth.json as " + tokenEnv + " after /login openai");
  }
  pi.registerProvider("openai", { apiKey: "$" + tokenEnv });
}
