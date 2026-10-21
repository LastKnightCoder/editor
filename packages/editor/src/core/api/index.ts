/**
 * `@tau/editor/api`：扩展作者的渲染入口；纯服务契约经 /api/services（ER-021）。
 *
 * 只放写扩展需要的东西：声明、服务、主题、少量工具。编辑器组件、kit 工厂等宿主用的留在包根入口。
 * 未标注过渡用途的导出按稳定 API 维护；过渡导出只供现有内部消费者迁移使用。
 */
export {
  EXTENSION_API_VERSION,
  defineExtension,
  defineElement,
  type EditorExtension,
  type ExtensionDefinition,
  type ElementSpec,
  type ElementFrame,
  type ElementEmptyContext,
  type ElementBehaviors,
  type ElementRenderProps,
  type ExtensionLayerProps,
} from "./extension";
export type { AnyExtension } from "./legacy";
export type { CopyDecision, CopyContext, ElementCopy } from "./copy";
export type { MarkSpec, MarkRenderProps, DecorationSpec } from "./marks";
export { useToolbarState } from "./toolbar";
export { default as ToolbarSubmenu } from "../components/HoveringToolbar/FloatingSubmenu";
export { Tooltip as EditorTooltip } from "../ui/Tooltip";
export { CaretRight as EditorCaretRight } from "../ui/CaretRight";
export { getParagraphShortcutEntry } from "../utils/paragraphShortcut";
export type { IngestContext, ElementIngestSpec } from "./ingest";
export { getElementResources } from "./resources";
export {
  ELEMENT_SELECTED_OUTLINE_CLASS,
  useElementFrame,
  type ElementFrameState,
} from "../components/ElementFrame";
export { isOverlayTarget, isTextTarget, shouldIgnoreBlockKey } from "../utils/blockKeyTarget";
export type {
  ContentResourceSpec,
  ContentResourceKind,
  ContentResourceDeclarations,
} from "@tau/db-schema/content-resources";
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
  IThemeService,
  IExtensionErrorReporter,
  IEditorNotifier,
  type ServiceIdentifier,
} from "../services/tokens";
export { useService, useOptionalService, useNotifier } from "../services/hooks";
export { notifierOf } from "../services/editorNotifier";
export type {
  EditorNotifier,
  EditorFeedback,
  EditorLoadingHandle,
  EditorConfirmOptions,
  EditorPromptOptions,
} from "../services/notifier";

// 主题
export { useEditorTheme, type EditorTheme } from "../theme/context";
export type { ThemeService, EditorThemeMode } from "../theme/ThemeService";

// 块菜单 / 工具条条目的形状
export type { IBlockPanelListItem, IConfigItem } from "../types";

// 扩展行为引用目标元素的类型
export type { CustomElement, InlineElement, BlockElement } from "../types/custom-element";

// 源码预览块共用的编辑、聚焦与插入机制
export {
  setOrInsertNode,
  canSetOrInsertNode,
  focusInsertedPreviewElement,
} from "../utils/insertElement";
export { default as ElementMenu, type ElementMenuProps } from "../components/ElementMenu";
export { default as InlineChromiumBugfix } from "../components/InlineChromiumBugFix";
export { default as useIsLastElement } from "../hooks/useIsLastElement";
export {
  registerBlockNavigation,
  hasBlockNavigation,
  unregisterBlockNavigation,
  focusPreviousBlock,
  focusNextBlock,
  type BlockNavigationHandler,
} from "../utils/blockNavigation";
export { isCollapsed, getCurrentTextNode } from "../utils/editor";
export { deleteVoidBlock } from "../utils/nodeOperations";
export { getSelectionSnapshot, isSelectionSnapshotUnchanged } from "../utils/selectionSnapshot";

export { createParagraph, isParagraphElement, type ParagraphElement } from "../model/paragraph";
export { insertParagraphAndFocus } from "../utils/editor";
// 选区查询保留单子节点口径；节点空态由核心基础和已安装领域声明共同决定。
export { isAtParagraphStart, isParagraphAndEmpty } from "../utils/editor";
export { isNodeEmpty } from "../kit/elementEmpty";
export { createBlockConversionMenu } from "../menu/conversion";
export { getCommandElementPath } from "../utils/commandTarget";
export {
  captureEditorSubmission,
  captureElementSubmission,
  captureInsertionSubmission,
  type Submission,
  type SubmissionOutcome,
  type SubmissionDiscardReason,
} from "./submission";
export { default as AddParagraph, type AddParagraphRef } from "../components/AddParagraph";

// 编辑器浮层的宿主仲裁适配；不承载页面导航或浮层渲染。
export {
  IOverlayBackDismiss,
  type OverlayBackDismissProps,
  type OverlayBackDismissAdapter,
} from "../services/overlayBackDismiss";
export { default as OverlayBackDismiss } from "../components/OverlayBackDismiss";

export { getElementParent, getClosestCurrentElement } from "../utils/editor";
export { getParentNodeByNode, getPreviousSiblingNode } from "../utils/element";
export { getPrevPath } from "../utils/path";
export { hitEmptyOrInlineChild, exitContainerOnEmptyParagraph } from "../utils/container";

export { replaceNode } from "../utils/editor";
export { findPathSafely } from "../utils/path";
export type { Plugin } from "../utils/plugin";
export { BLOCK_DRAG_GROUP, DragHandle, type DragHandleProps } from "../components/BlockDrag";
export { panAroundAnchor, pointFromCenter, type Point as ZoomPanPoint } from "../utils/zoomPan";
export { FloatingToolbar, ToolbarDivider, ToolbarIconButton } from "../components/FloatingToolbar";
