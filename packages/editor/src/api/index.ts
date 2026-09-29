/**
 * `@tau/editor/api`：扩展作者的唯一入口（ER-008、01 §5.4）。
 *
 * 只放写扩展需要的东西：声明、服务、主题、少量工具。编辑器组件、kit 工厂等宿主用的留在包根入口。
 * 这里导出的都视为稳定 API；新增前先想清楚「将来开放给第三方时愿不愿意长期维护它」。
 */
export {
  EXTENSION_API_VERSION,
  defineExtension,
  defineElement,
  type EditorExtension,
  type ExtensionDefinition,
  type ElementSpec,
  type ElementBehaviors,
  type ElementRenderProps,
} from "./extension";
export { fromLegacyExtension, type AnyExtension } from "./legacy";

// 服务：扩展只经服务访问宿主能力，不碰宿主全局对象
export {
  createServiceId,
  IResourceService,
  IFileService,
  ICompilerService,
  IOpenerService,
  IThemeService,
  IExtensionErrorReporter,
  IEditorNotifier,
  IMediaInsertSources,
  IVideoContentProviders,
  IMediaActions,
  IMediaSelectors,
  IEditorSlots,
  type ServiceIdentifier,
} from "../services/tokens";
export { useService, useOptionalService, useEditorSlots, useNotifier } from "../services/hooks";
export { notifierOf } from "../services/editorNotifier";
export type {
  EditorNotifier,
  EditorFeedback,
  EditorLoadingHandle,
  EditorConfirmOptions,
} from "../services/notifier";

// 主题
export { useEditorTheme, type EditorTheme } from "../theme/context";
export type { ThemeService, EditorThemeMode } from "../theme/ThemeService";

// 块菜单 / 工具条条目的形状
export type { IBlockPanelListItem, IConfigItem } from "../types";
