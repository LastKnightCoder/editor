import type { PluginDefinition } from "./contract";
export type * from "./upload";
export type * from "./tts";
export type * from "./images";
export type * from "./video";
export type * from "./publish";
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
export { useInlineSource, insertInlineSource, InlineSourceBoundary } from "./inline-source";
export * from "./sidebar";
export type * from "./excerpts";
export type * from "./data";
export { PLUGIN_EVENT_TYPES } from "./events";
export type { PluginDomainEvent, PluginEventType, PluginEvents } from "./events";
export { PLUGIN_PERMISSIONS, PluginPermissionError, isPluginPermission } from "./permissions";
export type {
  PluginPermission,
  PluginPermissions,
  PluginPermissionState,
  PluginPermissionDenial,
} from "./permissions";
export type * from "./services";
export { usePluginServices } from "./service-access";
export type { PluginSkill } from "./skills";
export type { PluginMCP, PluginMCPDefinition, PluginMCPTool, PluginMCPTransport } from "./mcp";
export type { PluginMCPToolResult } from "./mcp";
export type {
  PluginChat,
  PluginToolRendererDefinition,
  PluginToolRendererProps,
  ToolCallExecutionState,
} from "./chat";

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
