import type { PluginDefinition } from "@tau/plugins";
import { desktopContentPlugins } from "../../../shared/content-plugins.ts";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";
import { getPluginNodeTypes, type PluginRenderContext } from "@tau/plugins/rendering";

export const localPluginStateKey = (id: string) => `tau-local-plugin-enabled:v1:${id}`;
const entries = new Map<
  string,
  { artifact: DevelopmentPluginPackage; definition: PluginDefinition; nodeTypes: string[] }
>();
const errors = new Map<string, string>();
const intended = new Map<string, boolean>();
export const setContentPluginIntent = (id: string, enabled: boolean) => intended.set(id, enabled);
let builtinTypes: string[] = [];

export function initializeContentPluginState(types: readonly string[]) {
  builtinTypes = [...types];
}
export function addContentPlugin(artifact: DevelopmentPluginPackage, definition: PluginDefinition) {
  if (!intended.has(definition.id)) intended.set(definition.id, true);
  desktopContentPlugins.install([...desktopContentPlugins.list(), definition]);
  entries.set(definition.id, { artifact, definition, nodeTypes: getPluginNodeTypes(definition) });
}
export const contentPluginLoaded = (id: string) => entries.has(id);
export const contentPluginError = (id: string) => errors.get(id);
export const setContentPluginError = (id: string, error: unknown) =>
  errors.set(id, error instanceof Error ? error.message : String(error));
export function contentPluginDefinition(artifact: DevelopmentPluginPackage) {
  const loaded = entries.get(artifact.manifest.id);
  if (!loaded || JSON.stringify(loaded.artifact.manifest) !== JSON.stringify(artifact.manifest))
    throw new Error("内容插件需重启应用后加载");
  return loaded.definition;
}
export function getContentPluginPublishContext(): PluginRenderContext {
  for (const {
    artifact,
    definition: { id },
  } of entries.values()) {
    if (!artifact.manifest.editor) continue;
    if (intended.get(id) !== true) throw new Error("内容插件启停尚未生效，请重启后再发布");
  }
  return {
    builtinTypes: [...builtinTypes],
    plugins: [...entries.values()]
      .filter(entry => entry.artifact.manifest.editor)
      .map(({ artifact, definition, nodeTypes }) => ({
        id: definition.id,
        version: definition.version,
        mainHash: artifact.manifest.integrity[artifact.manifest.main],
        ...(artifact.manifest.styles
          ? { stylesHash: artifact.manifest.integrity[artifact.manifest.styles] }
          : {}),
        nodeTypes: [...nodeTypes],
        styleSources: definition.editorExtensions?.flatMap(
          extension => extension.styleSources ?? []
        ),
      })),
  };
}
