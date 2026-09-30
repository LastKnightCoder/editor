/**
 * `@tau/editor/api`：扩展作者的渲染入口；纯服务契约经 /api/services（ER-021）。
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
export type { AnyExtension } from "./legacy";
export {
  CommandRegistry,
  createCommandDispatcher,
  type EditorCommand,
  type EditorCommandContext,
  type EditorHotkey,
  type RegisteredCommand,
  type CommandDispatcher,
  type CommandGuard,
} from "./command";
export {
  type EditorMenuEntry,
  type EditorMenuContext,
  type EditorMenuContribution,
  type MenuValue,
} from "./menu";

// 服务：扩展只经服务访问宿主能力，不碰宿主全局对象
export {
  createServiceId,
  IResourceService,
  IFileService,
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

// 扩展行为引用目标元素的类型
export type { CustomElement } from "../types/custom-element";
export type { ParagraphElement } from "../types/element/paragraph";

// 源码预览块共用的编辑、聚焦与插入机制
export { default as PreviewWithEditor } from "../components/PreviewWithEditor";
export { isAtParagraphStart, isParagraphAndEmpty } from "../utils/editor";
export { setOrInsertNode, focusInsertedPreviewElement } from "../utils/insertElement";
export { default as InlineChromiumBugfix } from "../components/InlineChromiumBugFix";
