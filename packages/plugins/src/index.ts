import type { PluginDefinition } from "./contract";
export { usePluginEnvironment } from "./environment";
export type { PluginEnvironment } from "./environment";
export type { PluginNavigation, PluginNavigationEntry } from "./navigation";
export type { PluginBackendClient, BackendStatus, BackendState } from "./backend";
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
  useTextField,
  useReportPreviewError,
  insertSourceBlock,
  sourceBlockParagraphBehavior,
} from "./source-editor";
export type {
  SourceBlockEditorProps,
  PluginRuntimeStyleCompiler,
  TextFieldEditor,
} from "./source-editor";
export { useInlineSource, insertInlineSource, InlineSourceBoundary } from "./inline-source";
export { ContentEditor, ContentPreview, EntityRef } from "./components";
export {
  useElement,
  useMediaViewer,
  BlockToolbar,
  BlockToolbarButton,
  BlockToolbarGap,
} from "./element";
export type {
  ElementAccess,
  BlockToolbarProps,
  BlockToolbarButtonProps,
  EditorElementFrame,
} from "./element";
export {
  MediaImage,
  MediaVideo,
  MediaAudio,
  useResource,
  useResourceUpload,
  useMediaAppearance,
} from "./media";
export type {
  ResourceKind,
  ResourceState,
  ResourceUpload,
  MediaAppearance,
  MediaAppearancePreset,
  MediaImageProps,
  MediaVideoProps,
  MediaAudioProps,
  MediaRuntime,
} from "./media";
export type {
  ContentEditorKit,
  ContentEditorProps,
  ContentPreviewProps,
  EntityRefProps,
} from "./components";
export type * from "./sidebar";
export { SIDEBAR_GROUPS } from "./sidebar";
export type * from "./icons";
export type * from "./home";
export type * from "./actions";
export { PLUGIN_ACTION_TARGET_KINDS } from "./actions";
export type * from "./views";
export { PLUGIN_ENTITY_PANEL_KINDS } from "./views";
export type * from "./excerpts";
export type * from "./data";
export type { PluginContentInput } from "./content-input";
export { EDITOR_NODE_SCHEMA_VERSION, CONTENT_INPUT_LIMITS } from "./content-input";
export type * from "./entities";
export type * from "./records";
export type * from "./links";
export type * from "./transaction";
export type {
  PluginFieldCondition,
  PluginIndexes,
  PluginIndexType,
  PluginIndexValue,
  PluginOrderBy,
  PluginWhere,
} from "./query";
export { PluginConflictError } from "./errors";
export {
  PLUGIN_ENTITY_KINDS,
  PLUGIN_ENTITY_READ_PERMISSIONS,
  PLUGIN_APP_ACTIONS,
  PLUGIN_EXPORT_FORMATS,
  PLUGIN_NOTEBOOK_FROM_KINDS,
  PLUGIN_CHAT_CONTEXT_KINDS,
} from "./app";
export type {
  PluginNotifications,
  PluginNotificationOptions,
  PluginNotificationMode,
  PluginNotificationAction,
} from "./notifications";
export type {
  PluginApp,
  PluginAppAction,
  PluginAppActions,
  PluginAppActionResults,
  PluginContentLocation,
  PluginOpenOptions,
  PluginExportFormat,
  PluginEntityKind,
  PluginEntityRef,
  PluginEntityDescription,
  PluginPickOptions,
  PluginPickedEntity,
} from "./app";
export { PLUGIN_EVENT_TYPES } from "./events";
export type { PluginDomainEvent, PluginEventOrigin, PluginEventType, PluginEvents } from "./events";
export { PLUGIN_PERMISSIONS, PluginPermissionError, isPluginPermission } from "./permissions";
export type {
  PluginPermission,
  PluginPermissions,
  PluginPermissionState,
  PluginPermissionDenial,
} from "./permissions";
export type * from "./flashcards";
export type * from "./services";
export { usePluginServices } from "./service-access";
export type { PluginMCP, PluginMCPDefinition, PluginMCPTool, PluginMCPTransport } from "./mcp";
export type { PluginMCPToolResult } from "./mcp";
export type {
  PluginChat,
  PluginToolRendererDefinition,
  PluginToolRendererProps,
  ToolCallExecutionState,
} from "./chat";

export type {
  PluginPageContext,
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
  PluginAIFeatures,
  PluginAICapability,
  PluginAICapabilityClient,
  PluginAICapabilityRequest,
  PluginAIImage,
  PluginAIMessage,
} from "./ai";
export { PLUGIN_AI_CAPABILITIES, isPluginAICapability } from "./ai";

export * from "./asr";
export type * from "./websocket";
