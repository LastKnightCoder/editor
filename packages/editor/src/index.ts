export { default as Editor } from "./index.tsx";
export { useCollaboration, useCollaborationResource } from "./collaboration/context";
export type { EditorCollaborationBinding } from "./collaboration/types";
export {
  EditorContext,
  type EditorContextValue,
  type EditorFeatures,
} from "./contexts/EditorContext";
export {
  useEditorConfig,
  type EditorConfig,
  type EditorThemeConfig,
} from "./contexts/EditorConfig";
export {
  EditorProvider,
  useEditorExtensions,
  type EditorProviderProps,
} from "./contexts/EditorProvider";

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
} from "./services/tokens";
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
} from "./services/hooks";
export type { EditorSlots, ImageSlotProps, VideoSlotProps, AudioSlotProps } from "./services/slots";

export { default as useTheme } from "./hooks/useTheme";
export { default as useDragAndDrop } from "./hooks/useDragAndDrop";
export { default as useIsLastElement } from "./hooks/useIsLastElement";
export { default as useUploadResource } from "./hooks/useUploadResource";
export { createMarkdownPasteImportExtension } from "./extensions/markdown-paste-import";
export type { MarkdownImportFn } from "./extensions/markdown-paste-import";
export { default as PlantUMLExtension } from "./extensions/plantuml";
export type { PlantUMLExtensionOptions } from "./extensions/plantuml";
export { createImageExtensions } from "./extensions/image/createImageExtensions";
export type {
  ImageExtensionOptions,
  ImageAppearanceOption,
  ImageAppearanceSource,
} from "./extensions/image/appearanceOption";
export type { ImageAppearanceConfig } from "./extensions/image/utils/appearance";
export { default as useEditorFeatures } from "./hooks/useEditorFeatures";
export { useEditorTheme, EditorThemeScope } from "./theme/context";
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
export { default as InlineChromiumBugfix } from "./components/InlineChromiumBugFix";
export { default as EditorContextMenu } from "./components/EditorContextMenu";

// Hooks
export { useDragHandlerMenu } from "./hooks/useDragHandlerMenu";

// Constants
export * from "./constants";

// Context Menu Types
export type { ContextMenuItem, BuildMenuParams } from "./components/EditorContextMenu/types";
