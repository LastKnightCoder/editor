export { default as Editor } from "./CoreEditor";

export type { MarkSpec, MarkRenderProps } from "./api/marks";
export { createEditorKit } from "./kit/EditorKit";
export { renderElementSpec } from "./kit/ExtensionAssembly";
export { defaultMenuExtension } from "./menu/defaultMenu";
export type { EditorKit, EditorKitOptions, EditorKitExtendOptions } from "./kit/EditorKit";
export { createValueDocument } from "./document/EditorDocument";
export type {
  EditorDocument,
  EditorDocumentBinding,
  ValueDocumentOptions,
} from "./document/EditorDocument";

// Service Registry DI
export { createServiceId, IExtensionErrorReporter, IEditorNotifier } from "./services/tokens";
export { defaultEditorNotifier } from "./services/notifier";
export type {
  EditorNotifier,
  EditorFeedback,
  EditorLoadingHandle,
  EditorConfirmOptions,
  EditorPromptOptions,
} from "./services/notifier";
export { consoleErrorReporter } from "./services/errorReporter";
export type { ExtensionErrorEvent, ExtensionErrorReporter } from "./services/errorReporter";

export type { ServiceIdentifier } from "./services/tokens";
export { createServiceRegistry, createChildRegistry } from "./services/registry";
export type { ServiceRegistry, ServiceRegister, ServiceRegistration } from "./services/registry";
export { useServiceRegistry, useService, useOptionalService, useNotifier } from "./services/hooks";
export { notifierOf } from "./services/editorNotifier";

export { default as useIsLastElement } from "./hooks/useIsLastElement";

export { createMarkdownPasteImportExtension } from "./extensions/markdown-paste-import";
export type { MarkdownImportFn } from "./extensions/markdown-paste-import";
export { isMarkdownLikeText } from "./plugins/withMarkdownPasteImport";
export type { ImportFromMarkdownOptions } from "./plugins/withMarkdownPasteImport";

export { useEditorTheme, EditorThemeOverride } from "./theme/context";
export type { EditorTheme } from "./theme/context";
export { createDomThemeService, createStaticThemeService } from "./theme/ThemeService";
export type { ThemeService, EditorThemeMode } from "./theme/ThemeService";

export * from "./utils/element";

export {
  defineExtension,
  defineElement,
  type EditorExtension,
  type ElementSpec,
  type ElementEmptyContext,
  type ElementBehaviors,
  type ElementRenderProps,
  type ExtensionLayerProps,
  type EditorCommand,
  type EditorCommandContext,
  type EditorHotkey,
} from "./api";

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
// 拖拽 chrome 已收进内核（BlockDragHost，01 §5.4）；类名常量供宿主样式与测试引用
export { BLOCK_DRAG_GROUP } from "./components/BlockDrag";
