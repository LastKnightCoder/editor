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
export {
  SourceBlockEditor,
  useSourceBlock,
  useReportPreviewError,
  insertSourceBlock,
  sourceBlockParagraphBehavior,
} from "./source-editor";
export type { SourceBlockEditorProps, PluginRuntimeStyleCompiler } from "./source-editor";
export * from "./sidebar";
export type * from "./excerpts";
export type * from "./services";
export type { PluginSkill } from "./skills";

export type {
  PluginPageDefinition,
  PluginPageHandle,
  PluginPageParams,
  PluginPageProps,
  PluginPages,
} from "./pages";

export function definePlugin(
  definition: Omit<PluginDefinition, "apiVersion" | "create"> &
    Partial<Pick<PluginDefinition, "create">>
): PluginDefinition {
  return Object.freeze({
    ...definition,
    apiVersion: 1,
    create: definition.create ?? (() => ({ activate: () => undefined })),
  });
}
export type {
  PluginAI,
  PluginAIFeature,
  PluginAIRequest,
  PluginAIResult,
  PluginAIEvent,
} from "./ai";
