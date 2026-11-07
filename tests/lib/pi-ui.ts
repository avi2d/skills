import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBashToolDefinition,
  createCodemodeExtension,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  DefaultResourceLoader,
  type ExtensionAPI,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type Theme,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";

const BUILT_IN = ["read", "bash", "edit", "write", "grep", "find", "ls"];

function registerBuiltIns(cwd: string): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.registerTool(createReadToolDefinition(cwd));
    pi.registerTool(createBashToolDefinition(cwd));
    pi.registerTool(createEditToolDefinition(cwd));
    pi.registerTool(createWriteToolDefinition(cwd));
    pi.registerTool(createGrepToolDefinition(cwd));
    pi.registerTool(createFindToolDefinition(cwd));
    pi.registerTool(createLsToolDefinition(cwd));
  };
}

// pi publishes its active theme only on an extension context's UI and its renderers only on the tools an extension registers, so a runner holding those tools stands in for a session.
async function loadRunner(home: string): Promise<ExtensionRunner> {
  const loader = new DefaultResourceLoader({
    cwd: home,
    agentDir: home,
    settingsManager: SettingsManager.inMemory(),
    extensionFactories: [createCodemodeExtension(), registerBuiltIns(home)],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const { extensions, runtime } = loader.getExtensions();
  const modelRuntime = await ModelRuntime.create({ authPath: join(home, "auth.json"), modelsPath: null, refreshOnCreate: false });
  return new ExtensionRunner(extensions, runtime, home, SessionManager.inMemory(home), new ModelRegistry(modelRuntime));
}

const home = mkdtempSync(join(tmpdir(), "pi-ui-"));
const runner = await loadRunner(home).finally(() => rmSync(home, { recursive: true, force: true }));

function renderersOf(tool: string): ToolRenderers {
  const definition = runner.getToolDefinition(tool);
  if (!definition) throw new Error(`pi registered no ${tool} tool`);
  return definition;
}

// Reads whichever theme initTheme last set, so a test calls initTheme before painting with it.
export const theme: Theme = runner.createContext().ui.theme;

export const codemodeRenderers: ToolRenderers = renderersOf("codemode");

export const builtInRenderers: Readonly<Record<string, ToolRenderers>> = Object.fromEntries(BUILT_IN.map((tool) => [tool, renderersOf(tool)]));
