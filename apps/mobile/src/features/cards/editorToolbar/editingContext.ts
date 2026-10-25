import { useEffect, useMemo, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { columnCount, getCellPosition, getTableAt } from "@tau/editor/extensions/table";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Range,
  type Element as ElementNode,
  type Path,
} from "slate";
import { ReactEditor } from "slate-react";
import { getPreviewEditorActions, type PreviewEditorActions } from "@tau/editor-source-view/menu";

/** 触屏下可被选中操作的媒体元素类型 */
export type MediaElementType = "image" | "inline-image" | "video" | "audio" | "webview";

const MEDIA_ELEMENT_TYPES = new Set<string>(["image", "inline-image", "video", "audio", "webview"]);

export function isMediaElementType(type: unknown): type is MediaElementType {
  return typeof type === "string" && MEDIA_ELEMENT_TYPES.has(type);
}

/** 配件栏的编辑上下文：决定配件栏渲染哪一组工具 */
export type EditingContext =
  | { kind: "text" }
  | { kind: "selection" }
  | {
      kind: "table";
      tablePath: Path;
      row: number;
      col: number;
      rowCount: number;
      colCount: number;
    }
  | {
      kind: "code";
      element: ElementNode;
      path: Path;
      textarea: HTMLTextAreaElement;
      uuid?: string;
      language?: string;
    }
  | { kind: "block-math"; path: Path; input: HTMLTextAreaElement }
  | { kind: "inline-math"; path: Path; input: HTMLInputElement }
  | { kind: "content-link"; element: ElementNode; path: Path }
  | {
      /** 选区折叠在源码预览块内（触屏下点选）：块登记的名称、图标与动作 */
      kind: "source-block";
      element: ElementNode;
      path: Path;
      actions: PreviewEditorActions;
    }
  | {
      kind: "media";
      mediaType: MediaElementType;
      element: ElementNode;
      path: Path;
      /** 焦点在图片说明输入里（此时 Slate 失焦、键盘弹起） */
      captionEditing: boolean;
    };

export type MediaEditingContext = Extract<EditingContext, { kind: "media" }>;

export type ContentLinkEditingContext = Extract<EditingContext, { kind: "content-link" }>;

export type TableEditingContext = Extract<EditingContext, { kind: "table" }>;

export type CodeEditingContext = Extract<EditingContext, { kind: "code" }>;

export type SourceBlockEditingContext = Extract<EditingContext, { kind: "source-block" }>;

export type VoidEditorContext = Extract<
  EditingContext,
  { kind: "code" | "block-math" | "inline-math" }
>;

export const TEXT_CONTEXT: EditingContext = { kind: "text" };
const SELECTION_CONTEXT: EditingContext = { kind: "selection" };

/** 代码块内部的原生 textarea */
const CODE_BLOCK_INPUT_SELECTOR = ".code-block-shiki-input";
/** 源码预览块在块内编辑时的编辑器容器（块公式在触屏下原位编辑） */
const PREVIEW_SOURCE_SELECTOR = ".ed-preview-source";
const SLATE_ELEMENT_SELECTOR = '[data-slate-node="element"]';
const SLATE_EDITOR_SELECTOR = "[data-slate-editor]";
/** 图片说明的就地输入（Image 组件在说明区标的 data 属性） */
const MEDIA_CAPTION_SELECTOR = "[data-media-caption]";
/** 行内公式原位输入框（InlineMath 组件的 data 属性），并用选区所在 inline-math 节点二次确认 */
const INLINE_MATH_INPUT_SELECTOR = "input[data-inline-math-input]";

const VOID_EDITOR_KINDS = new Set<EditingContext["kind"]>(["code", "block-math", "inline-math"]);

export function isVoidEditorContext(context: EditingContext): context is VoidEditorContext {
  return VOID_EDITOR_KINDS.has(context.kind);
}

/** 上下文的稳定标识：同一表格内换单元格不变，用于记录「手动退回通用模式」 */
export function getEditingContextKey(context: EditingContext): string {
  switch (context.kind) {
    case "text":
    case "selection":
      return context.kind;
    case "table":
      return `table:${context.tablePath.join(".")}`;
    case "media":
      return `media:${context.path.join(".")}${context.captionEditing ? ":caption" : ""}`;
    default:
      return `${context.kind}:${context.path.join(".")}`;
  }
}

const getNodeType = (node: unknown) => (node as { type?: unknown }).type;

/** DOM 元素所在的 Slate 元素节点；节点不属于当前编辑器时返回 null */
function findOwnSlateElement(
  editor: SlateEditor,
  target: HTMLElement
): { element: ElementNode; path: Path } | null {
  const elementDom = target.closest(SLATE_ELEMENT_SELECTOR);
  if (!elementDom) return null;
  try {
    const node = ReactEditor.toSlateNode(editor as ReactEditor, elementDom);
    if (!SlateElement.isElement(node)) return null;
    const path = ReactEditor.findPath(editor as ReactEditor, node);
    // findPath 只沿全局父子映射回溯，需回到本编辑器取节点确认归属
    if (!SlateNode.has(editor, path) || SlateNode.get(editor, path) !== node) return null;
    return { element: node, path };
  } catch {
    return null;
  }
}

function findSelectedInlineMath(editor: SlateEditor): Path | null {
  if (!editor.selection) return null;
  const entry = SlateEditor.above(editor, {
    at: editor.selection,
    voids: true,
    match: node => SlateElement.isElement(node) && getNodeType(node) === "inline-math",
  });
  return entry ? entry[1] : null;
}

/** 焦点在当前编辑器的 void 内部编辑器（代码块 / 块公式 / 行内公式）时返回对应上下文 */
export function resolveVoidEditorContext(
  editor: SlateEditor,
  activeElement: Element | null
): VoidEditorContext | null {
  if (!(activeElement instanceof HTMLElement)) return null;
  if (ReactEditor.isReadOnly(editor as ReactEditor)) return null;

  // 源码预览块与代码块用同一种叠层输入框，先按容器认出源码预览块
  const host = activeElement.closest<HTMLElement>(PREVIEW_SOURCE_SELECTOR);
  if (host) {
    const owner = findOwnSlateElement(editor, host);
    if (
      owner &&
      getNodeType(owner.element) === "block-math" &&
      activeElement instanceof HTMLTextAreaElement
    ) {
      return { kind: "block-math", path: owner.path, input: activeElement };
    }
    return null;
  }

  if (
    activeElement instanceof HTMLTextAreaElement &&
    activeElement.matches(CODE_BLOCK_INPUT_SELECTOR)
  ) {
    const owner = findOwnSlateElement(editor, activeElement);
    if (!owner || getNodeType(owner.element) !== "code-block") return null;
    const { uuid, language } = owner.element as { uuid?: string; language?: string };
    return {
      kind: "code",
      element: owner.element,
      path: owner.path,
      textarea: activeElement,
      uuid,
      language,
    };
  }

  if (
    activeElement instanceof HTMLInputElement &&
    !activeElement.closest(SLATE_EDITOR_SELECTOR) &&
    activeElement.matches(INLINE_MATH_INPUT_SELECTOR)
  ) {
    const path = findSelectedInlineMath(editor);
    return path ? { kind: "inline-math", path, input: activeElement } : null;
  }

  return null;
}

/** 焦点在本编辑器某张图片的说明输入里时返回该图片的媒体上下文 */
export function resolveMediaCaptionContext(
  editor: SlateEditor,
  activeElement: Element | null
): MediaEditingContext | null {
  if (!(activeElement instanceof HTMLElement)) return null;
  if (ReactEditor.isReadOnly(editor as ReactEditor)) return null;
  const caption = activeElement.closest<HTMLElement>(MEDIA_CAPTION_SELECTOR);
  if (!caption) return null;
  const owner = findOwnSlateElement(editor, caption);
  if (!owner || getNodeType(owner.element) !== "image") return null;
  return {
    kind: "media",
    mediaType: "image",
    element: owner.element,
    path: owner.path,
    captionEditing: true,
  };
}

/** 选区折叠在媒体 void 内（触屏下点选媒体）时返回媒体上下文 */
export function resolveMediaContext(editor: SlateEditor): MediaEditingContext | null {
  const selection = editor.selection;
  if (!selection || !Range.isCollapsed(selection)) return null;
  if (ReactEditor.isReadOnly(editor as ReactEditor)) return null;
  const entry = SlateEditor.above(editor, {
    at: selection,
    voids: true,
    mode: "lowest",
    match: node => SlateElement.isElement(node) && isMediaElementType(getNodeType(node)),
  });
  if (!entry) return null;
  const [element, path] = entry as [ElementNode, Path];
  return {
    kind: "media",
    mediaType: getNodeType(element) as MediaElementType,
    element,
    path,
    captionEditing: false,
  };
}

/** 选区折叠在登记了动作的源码预览块内（触屏下点选）时返回源码块上下文 */
export function resolveSourceBlockContext(editor: SlateEditor): SourceBlockEditingContext | null {
  const selection = editor.selection;
  if (!selection || !Range.isCollapsed(selection)) return null;
  if (ReactEditor.isReadOnly(editor as ReactEditor)) return null;
  const entry = SlateEditor.above(editor, {
    at: selection,
    voids: true,
    mode: "lowest",
    match: node => SlateElement.isElement(node) && getPreviewEditorActions(node) !== undefined,
  });
  if (!entry) return null;
  const [element, path] = entry as [ElementNode, Path];
  const actions = getPreviewEditorActions(element);
  return actions ? { kind: "source-block", element, path, actions } : null;
}

/** 光标折叠在内容引用的文字里时返回引用上下文 */
export function resolveContentLinkContext(editor: SlateEditor): ContentLinkEditingContext | null {
  const selection = editor.selection;
  if (!selection || !Range.isCollapsed(selection)) return null;
  if (ReactEditor.isReadOnly(editor as ReactEditor)) return null;
  const entry = SlateEditor.above(editor, {
    at: selection,
    match: node => SlateElement.isElement(node) && getNodeType(node) === "content-link",
  });
  if (!entry) return null;
  const [element, path] = entry as [ElementNode, Path];
  return { kind: "content-link", element, path };
}

/** 光标所在单元格的表格上下文；不在表格内返回 null */
export function resolveTableContext(editor: SlateEditor): TableEditingContext | null {
  const position = getCellPosition(editor);
  if (!position) return null;
  const table = getTableAt(editor, position.tablePath);
  if (!table) return null;
  return {
    kind: "table",
    tablePath: position.tablePath,
    row: position.row,
    col: position.col,
    rowCount: table.children.length,
    colCount: columnCount(table),
  };
}

/** 优先级：图片说明 / void 内部编辑器（焦点所在）> 展开选区 > 媒体 / 源码块 > 内容引用 > 表格 > 通用文本 */
export function resolveEditingContext(
  editor: SlateEditor,
  activeElement: Element | null
): EditingContext {
  const focusedContext =
    resolveMediaCaptionContext(editor, activeElement) ??
    resolveVoidEditorContext(editor, activeElement);
  if (focusedContext) return focusedContext;
  const selection = editor.selection;
  if (selection && !Range.isCollapsed(selection)) return SELECTION_CONTEXT;
  return (
    resolveMediaContext(editor) ??
    resolveSourceBlockContext(editor) ??
    resolveContentLinkContext(editor) ??
    resolveTableContext(editor) ??
    TEXT_CONTEXT
  );
}

/** 随选区版本与文档焦点变化重算编辑上下文；focusout 后等一帧再判，避免焦点切换瞬间闪烁 */
export function useEditingContext(
  editorRef: RefObject<EditorRef | null>,
  selectionVersion: number
): EditingContext {
  const [focusVersion, setFocusVersion] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let frame: number | null = null;
    const bump = () => setFocusVersion(value => value + 1);
    const cancelFrame = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
    };
    const handleFocusIn = () => {
      cancelFrame();
      bump();
    };
    const handleFocusOut = () => {
      cancelFrame();
      frame = window.requestAnimationFrame(() => {
        frame = null;
        bump();
      });
    };
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      cancelFrame();
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return useMemo(() => {
    void selectionVersion;
    void focusVersion;
    const editor = editorRef.current?.getEditor() as SlateEditor | undefined;
    if (!editor) return TEXT_CONTEXT;
    return resolveEditingContext(
      editor,
      typeof document === "undefined" ? null : document.activeElement
    );
  }, [editorRef, focusVersion, selectionVersion]);
}
