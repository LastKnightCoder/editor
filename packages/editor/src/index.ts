export { default as Editor, EditorContext } from './index.tsx';
export type { EditorFeatures } from './index.tsx';

export type {
  EditorServices,
  ResourceService,
  DataTableService,
  FileService,
  MediaService,
  WhiteboardService,
  SettingsService,
  ThemeService,
  AIService,
  CompilerService,
  UtilityService,
  MediaInfo,
  ThemeColors,
  WhiteBoardContent,
  IResource,
  WebLinkSourceType,
  WhiteBoard,
} from './types/services';

export {
  EditorServicesContext,
  EditorServicesProvider,
  useEditorServices,
} from './contexts/EditorServicesContext';

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
} from '@tau/shared';

export { default as useTheme } from './hooks/useTheme';
export { default as useThemeColors } from './hooks/useThemeColors';
export { default as useSettings } from './hooks/useSettings';
export { default as useDragAndDrop } from './hooks/useDragAndDrop';
export { default as useEditorFeatures } from './hooks/useEditorFeatures';

export {
  generateExecutableCode,
  compileAndExecuteCustomBlock,
} from './extensions/custom-block/utils/renderTemplate';
export { default as TemplatePreview } from './extensions/custom-block/components/TemplateSelector/TemplatePreview';

export * from './utils/element';

export type { default as IExtension, IExtensionBaseProps } from './extensions/types';
export { default as Base } from './extensions/base';

export {
  createBlockElementPlugin,
  createInlineElementPlugin,
  createVoidElementPlugin,
} from './utils/plugin';

// Editor utilities
export * from './utils';

// All types
export * from './types';
export * from './types/custom-element';

// Components
export { default as AddParagraph } from './components/AddParagraph';
export { default as InlineChromiumBugfix } from './components/InlineChromiumBugFix';
export { default as EditorContextMenu } from './components/EditorContextMenu';

// Hooks
export { useDragHandlerMenu } from './hooks/useDragHandlerMenu';

// Extensions
export { notionCompatibleExtensions } from './extensions/notion-compatible';

// Constants
export * from './constants';

// Context Menu Types
export type { ContextMenuItem, BuildMenuParams } from './components/EditorContextMenu/types';
