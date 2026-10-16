import type { PluginDefinition } from "./contract";
export type {
  JsonValue,
  Disposable,
  PluginStorage,
  PluginCommand,
  PluginContext,
  PluginInstance,
  PluginDefinition,
} from "./contract";
export type {
  PluginSettings,
  PluginSettingsDefinition,
  PluginSettingsProps,
  PluginSettingsHandle,
} from "./settings";
export * from "./editor";
export * from "./sidebar";

export type {
  PluginPageDefinition,
  PluginPageHandle,
  PluginPageParams,
  PluginPageProps,
  PluginPages,
} from "./pages";

export function definePlugin(definition: Omit<PluginDefinition, "apiVersion">): PluginDefinition {
  return Object.freeze({ ...definition, apiVersion: 1 });
}
