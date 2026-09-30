export { default as Editor } from "./index.tsx";
export { createEditorKit, createBareEditorKit, createEditorKitFromRegistry } from "./kit/EditorKit";
export type { EditorKit, EditorKitOptions, EditorKitExtendOptions } from "./kit/EditorKit";
export { createValueDocument } from "./document/EditorDocument";
export type {
  EditorDocument,
  EditorDocumentBinding,
  ValueDocumentOptions,
} from "./document/EditorDocument";

export type {
  ResourceService,
  FileService,
  CompilerService,
  OpenerService,
} from "./types/services";

// Service Registry DI
export {
  createServiceId,
  IResourceService,
  IFileService,
  ICompilerService,
  IOpenerService,
  IMediaInsertSources,
  IVideoContentProviders,
  IMediaActions,
  IMediaSelectors,
  IEditorSlots,
  IExtensionErrorReporter,
  IEditorNotifier,
} from "./services/tokens";
export { defaultEditorNotifier } from "./services/notifier";
export type {
  EditorNotifier,
  EditorFeedback,
  EditorLoadingHandle,
  EditorConfirmOptions,
} from "./services/notifier";
export { consoleErrorReporter } from "./services/errorReporter";
export type { ExtensionErrorEvent, ExtensionErrorReporter } from "./services/errorReporter";
export type {
  MediaType,
  MediaInsertPayload,
  MediaInsertSource,
  VideoContentProvider,
  MediaAction,
  MediaSelector,
  SelectedMedia,
} from "./services/mediaProviders";
export type { ServiceIdentifier } from "./services/tokens";
export { createServiceRegistry, createChildRegistry } from "./services/registry";
export type { ServiceRegistry, ServiceRegister, ServiceRegistration } from "./services/registry";
export {
  useServiceRegistry,
  useService,
  useOptionalService,
  useEditorSlots,
  useNotifier,
} from "./services/hooks";
export { notifierOf } from "./services/editorNotifier";
export type { EditorSlots, ImageSlotProps, VideoSlotProps, AudioSlotProps } from "./services/slots";

export { default as useTheme } from "./hooks/useTheme";
export { default as useIsLastElement } from "./hooks/useIsLastElement";
export { default as useUploadResource } from "./hooks/useUploadResource";
export { createMarkdownPasteImportExtension } from "./extensions/markdown-paste-import";
export type { MarkdownImportFn } from "./extensions/markdown-paste-import";
export { isMarkdownLikeText } from "./plugins/withMarkdownPasteImport";
export type { ImportFromMarkdownOptions } from "./plugins/withMarkdownPasteImport";
export { default as PlantUMLExtension } from "./extensions/plantuml";
export type { PlantUMLExtensionOptions } from "./extensions/plantuml";
export { createImageExtensions } from "./extensions/image/createImageExtensions";
export { default as headerExtension, createHeaderExtension } from "./extensions/header";
export type { HeaderExtensionOptions } from "./extensions/header";
export type {
  ImageExtensionOptions,
  ImageAppearanceOption,
  ImageAppearanceSource,
} from "./extensions/image/appearanceOption";
export type { ImageAppearanceConfig } from "./extensions/image/utils/appearance";
export { useEditorTheme, EditorThemeOverride } from "./theme/context";
export type { EditorTheme } from "./theme/context";
export { createDomThemeService, createStaticThemeService } from "./theme/ThemeService";
export type { ThemeService, EditorThemeMode } from "./theme/ThemeService";

export {
  generateExecutableCode,
  compileAndExecuteCustomBlock,
  rerenderCustomBlockTheme,
} from "./extensions/custom-block/utils/renderTemplate";

export * from "./utils/element";

export type { default as IExtension, IExtensionBaseProps } from "./extensions/types";
export {
  defineExtension,
  defineElement,
  fromLegacyExtension,
  type EditorExtension,
  type AnyExtension,
  type ElementSpec,
  type ElementBehaviors,
  type ElementRenderProps,
} from "./api";
export { default as Base } from "./extensions/base";

export {
  createBlockElementPlugin,
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "./utils/plugin";

// Editor utilities
export * from "./utils";

// All types
export * from "./types";
export * from "./types/custom-element";

// Components
export { default as AddParagraph } from "./components/AddParagraph";
// 内容注入声明的类型（run/when 的签名，01 §5.4）
export type {
  IngestContext,
  IngestFilesRule,
  IngestTextRule,
  ElementIngestSpec,
} from "./api/ingest";
export { default as InlineChromiumBugfix } from "./components/InlineChromiumBugFix";
export { default as EditorContextMenu } from "./components/EditorContextMenu";
// 拖拽 chrome 已收进内核（BlockDragHost，01 §5.4）；类名常量供宿主样式与测试引用
export { BLOCK_DRAG_GROUP } from "./components/BlockDrag";

// Constants
export * from "./constants";

// Context Menu Types
export type { ContextMenuItem, BuildMenuParams } from "./components/EditorContextMenu/types";
