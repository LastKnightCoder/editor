export { default as Editor } from "./index.tsx";
export { useCollaboration, useCollaborationResource } from "./collaboration/context";
export type { EditorCollaborationBinding } from "./collaboration/types";
export {
  EditorContext,
  type EditorContextValue,
  type EditorFeatures,
} from "./contexts/EditorContext";

export type {
  EditorServices,
  ResourceService,
  FileService,
  MediaService,
  SettingsService,
  ThemeService,
  AIService,
  ImageGenerationResult,
  ImageGenerationService,
  CompilerService,
  UtilityService,
  MediaInfo,
  ThemeColors,
  IResource,
  WebLinkSourceType,
} from "./types/services";

export {
  EditorServicesContext,
  EditorServicesProvider,
  useEditorServices,
} from "./contexts/EditorServicesContext";

export type {
  DataTable,
  DataTableView,
  CreateDataTableView,
  UpdateDataTableView,
  DatabaseData,
  TableViewConfig as DataTableViewConfig,
  DatabaseHookResult,
  ColumnDef as DataTableColumn,
  RowData as DataTableRow,
} from "@tau/shared";

export { default as useTheme } from "./hooks/useTheme";
export { default as useThemeColors } from "./hooks/useThemeColors";
export { default as useSettings } from "./hooks/useSettings";
export { default as useDragAndDrop } from "./hooks/useDragAndDrop";
export { default as useEditorFeatures } from "./hooks/useEditorFeatures";
export { useImageGeneration } from "./hooks/useImageGeneration";

export {
  generateExecutableCode,
  compileAndExecuteCustomBlock,
  rerenderCustomBlockTheme,
} from "./extensions/custom-block/utils/renderTemplate";
export { default as TemplatePreview } from "./extensions/custom-block/components/TemplateSelector/TemplatePreview";

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
