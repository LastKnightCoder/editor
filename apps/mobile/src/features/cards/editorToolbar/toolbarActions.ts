import { openLinkPanel } from "@tau/editor/extensions/link";
import { wrapComment, unwrapComment } from "@tau/editor/extensions/comment";
import { wrapKbd, unwrapKbd } from "@tau/editor/extensions/kbd";
import { unwrapStyledText, wrapStyledText } from "@tau/editor/extensions/styled-text";
import { unwrapUnderline, wrapUnderline } from "@tau/editor/extensions/underline";
import {
  TEXT_GRADIENT_PRESETS,
  type TextGradientPresetId,
} from "@tau/editor/extensions/text-formatting/palette";
import { Editor, Element, Node, Path, Range, Transforms, type BaseSelection } from "slate";
import { ReactEditor } from "slate-react";

export type MarkActionId = "bold" | "italic" | "strikethrough" | "code";
export type InlineWrapActionId = "underline" | "link" | "styled-text";
export type CustomMarkActionId = "color" | "highlight";
/** 块级操作：标题 / 列表 / 引用 / 分割线 */
export type BlockActionId =
  | "heading-one"
  | "heading-two"
  | "heading-three"
  | "bulleted-list"
  | "numbered-list"
  | "quote"
  | "divider";
export type UnderlineColor = "default" | "yellow" | "green" | "blue" | "purple" | "red";
export type UnderlineLineType = "solid" | "dashed" | "dotted" | "wavy";
export type UnderlineStylePayload = Partial<{
  color: UnderlineColor;
  lineType: UnderlineLineType;
}>;
export type ToolbarActionId =
  | MarkActionId
  | InlineWrapActionId
  | CustomMarkActionId
  | BlockActionId
  | "kbd"
  | "comment"
  | "content-link";

export type ToolbarActionItem = {
  id: ToolbarActionId;
  label: string;
};

export type TextColorOption = {
  label: string;
  lightColor?: string;
  darkColor?: string;
};

export type TextGradientOption = {
  label: string;
  preset: TextGradientPresetId;
  previewLight: string;
  previewDark: string;
};

export type HighlightOption = {
  label: string;
  value?: string;
  previewColor?: string;
};

export type UnderlineColorOption = {
  label: string;
  value: UnderlineColor;
  previewColor: string;
};

export type UnderlineLineTypeOption = {
  label: string;
  value: UnderlineLineType;
};

export const TEXT_STYLE_ACTIONS: ToolbarActionItem[] = [
  { id: "bold", label: "加粗" },
  { id: "italic", label: "斜体" },
  { id: "strikethrough", label: "删除线" },
  { id: "code", label: "代码" },
  { id: "kbd", label: "快捷键" },
];

export const MORE_ACTIONS: ToolbarActionItem[] = [
  { id: "comment", label: "批注" },
  { id: "content-link", label: "关联内容" },
];

export const PRIMARY_ACTIONS: ToolbarActionItem[] = [
  { id: "underline", label: "下划线" },
  { id: "styled-text", label: "样式文本" },
  { id: "link", label: "链接" },
  { id: "color", label: "颜色" },
  { id: "highlight", label: "高亮" },
];

/** 判断块级 id */
export function isBlockAction(actionId: ToolbarActionId): actionId is BlockActionId {
  return (
    actionId === "heading-one" ||
    actionId === "heading-two" ||
    actionId === "heading-three" ||
    actionId === "bulleted-list" ||
    actionId === "numbered-list" ||
    actionId === "quote" ||
    actionId === "divider"
  );
}

type TypedElement = Element & { type?: string; level?: number };

/** 可被块级切换直接改写的块：非 void、非列表容器/列表项（列表结构需先解包再改写） */
function isConvertibleBlock(editor: Editor, node: Node): boolean {
  if (Editor.isEditor(node) || !Element.isElement(node)) {
    return false;
  }
  if (Editor.isVoid(editor, node)) {
    return false;
  }
  const nodeType = (node as TypedElement).type;
  return nodeType !== "bulleted-list" && nodeType !== "numbered-list" && nodeType !== "list-item";
}

function findBlockByType(editor: Editor, type: string): [TypedElement, Path] | null {
  if (!editor.selection) {
    return null;
  }
  const [entry] = Editor.nodes(editor, {
    at: editor.selection,
    match: node =>
      !Editor.isEditor(node) && Element.isElement(node) && (node as TypedElement).type === type,
  });
  return (entry as [TypedElement, Path] | undefined) ?? null;
}

/** 显式设定标题级别（弹条语义，非 toggle）：level 为 "paragraph" 时把标题块退回段落 */
export function applyHeaderBlock(editor: Editor, level: 1 | 2 | 3 | "paragraph"): void {
  const entry = findBlockByType(editor, "header");
  if (entry) {
    const [, path] = entry;
    if (level === "paragraph") {
      Transforms.setNodes(editor, { type: "paragraph" }, { at: path });
    } else {
      Transforms.setNodes(editor, { type: "header", level }, { at: path });
    }
    return;
  }
  if (level === "paragraph" || !editor.selection) {
    return;
  }
  Transforms.setNodes(
    editor,
    { type: "header", level },
    {
      at: editor.selection,
      match: node => isConvertibleBlock(editor, node),
    }
  );
}

/** 切换无序/有序列表：同类型 → 解包回段落；另一类型 → 容器换类型；普通块 → 包成 list-item + 列表 */
export function toggleListBlock(editor: Editor, listType: "bulleted-list" | "numbered-list"): void {
  if (!editor.selection) {
    return;
  }
  const isListContainer = (node: Node): node is TypedElement =>
    !Editor.isEditor(node) &&
    Element.isElement(node) &&
    ((node as TypedElement).type === "bulleted-list" ||
      (node as TypedElement).type === "numbered-list");
  const [listEntry] = Editor.nodes(editor, {
    at: editor.selection,
    match: isListContainer,
  });
  if (listEntry) {
    const [node, path] = listEntry as [TypedElement, Path];
    if (node.type === listType) {
      Transforms.unwrapNodes(editor, {
        match: n =>
          !Editor.isEditor(n) && Element.isElement(n) && (n as TypedElement).type === "list-item",
      });
      Transforms.unwrapNodes(editor, { match: isListContainer });
    } else {
      Transforms.setNodes(editor, { type: listType }, { at: path });
    }
    return;
  }
  Transforms.setNodes(
    editor,
    { type: "list-item" },
    {
      at: editor.selection,
      match: node => isConvertibleBlock(editor, node),
    }
  );
  Transforms.wrapNodes(
    editor,
    { type: listType, children: [] },
    {
      match: node =>
        !Editor.isEditor(node) &&
        Element.isElement(node) &&
        (node as TypedElement).type === "list-item",
    }
  );
}

/** 切换引用块：blockquote 是容器块，关闭时把内部段落提升回父级 */
export function toggleQuoteBlock(editor: Editor): void {
  if (!editor.selection) {
    return;
  }
  const entry = findBlockByType(editor, "blockquote");
  if (entry) {
    Transforms.unwrapNodes(editor, {
      match: node =>
        !Editor.isEditor(node) &&
        Element.isElement(node) &&
        (node as TypedElement).type === "blockquote",
    });
    return;
  }
  Transforms.wrapNodes(
    editor,
    { type: "blockquote", children: [] },
    {
      at: editor.selection,
      match: node => isConvertibleBlock(editor, node),
    }
  );
}

/** 「转换为」面板识别的当前块类型 */
export type CurrentBlockKind =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "check-list"
  | "bulleted-list"
  | "numbered-list"
  | "quote"
  | "other";

const BLOCK_CONTAINER_TYPES = new Set(["list-item", "check-list-item", "blockquote"]);

/** 列表项 / 待办项 / 引用容器映射为块类型；列表项取父容器的列表类型 */
function containerBlockKind(editor: Editor, node: TypedElement, path: Path): CurrentBlockKind {
  if (node.type === "check-list-item") return "check-list";
  if (node.type === "blockquote") return "quote";
  const parentType = (Node.parent(editor, path) as TypedElement).type;
  return parentType === "bulleted-list" || parentType === "numbered-list" ? parentType : "other";
}

/** 取选区锚点所在最内层文本块判断块类型：标题看 level，段落再看最近的列表项 / 待办项 / 引用祖先 */
export function getBlockKindAt(editor: Editor, selection: BaseSelection): CurrentBlockKind {
  if (!selection || !Node.has(editor, selection.anchor.path)) return "other";
  const blockEntry = Editor.above<TypedElement>(editor, {
    at: selection.anchor,
    mode: "lowest",
    match: node => Element.isElement(node) && Editor.isBlock(editor, node),
  });
  if (!blockEntry) return "other";
  const [block, blockPath] = blockEntry;
  if (block.type === "header") {
    if (block.level === 1) return "h1";
    if (block.level === 2) return "h2";
    if (block.level === 3) return "h3";
    return "other";
  }
  if (BLOCK_CONTAINER_TYPES.has(block.type ?? "")) {
    return containerBlockKind(editor, block, blockPath);
  }
  if (block.type !== "paragraph") return "other";
  const containerEntry = Editor.above<TypedElement>(editor, {
    at: blockPath,
    mode: "lowest",
    match: node =>
      Element.isElement(node) && BLOCK_CONTAINER_TYPES.has((node as TypedElement).type ?? ""),
  });
  return containerEntry
    ? containerBlockKind(editor, containerEntry[0], containerEntry[1])
    : "paragraph";
}

/**
 * 读取选区文本 marks 用于面板选中态。折叠选区以光标处文本 marks 为底，叠加待输入 marks 中已设置的键：
 * 对选区应用样式后会折叠并清掉待输入 marks（避免续写沾色），只读待输入 marks 会丢失刚应用的样式。
 */
export function getSelectionMarks(editor: Editor): Record<string, unknown> | null {
  if (!editor.selection) return null;
  if (Range.isExpanded(editor.selection) || !editor.marks) {
    return (Editor.marks(editor) as Record<string, unknown> | null) ?? null;
  }
  const pending = editor.marks as Record<string, unknown>;
  editor.marks = null;
  try {
    const textMarks = (Editor.marks(editor) as Record<string, unknown> | null) ?? {};
    const merged: Record<string, unknown> = { ...textMarks };
    for (const [key, value] of Object.entries(pending)) {
      if (value) merged[key] = value;
    }
    return merged;
  } finally {
    editor.marks = pending as Editor["marks"];
  }
}

/** 在当前块后插入分割线（void 块） */
export function insertDividerBlock(editor: Editor): void {
  Transforms.insertNodes(
    editor,
    { type: "divide-line", children: [{ type: "formatted", text: "" }] },
    { select: true }
  );
}

export const TEXT_COLOR_OPTIONS: TextColorOption[] = [
  { label: "默认", lightColor: undefined, darkColor: undefined },
  { label: "灰色", lightColor: "#8f959e", darkColor: "#757575" },
  { label: "红色", lightColor: "#e33a32", darkColor: "#fa7873" },
  { label: "橙色", lightColor: "#e57d05", darkColor: "#f5a54a" },
  { label: "黄色", lightColor: "#dc9b04", darkColor: "#fcd456" },
  { label: "绿色", lightColor: "#2ea121", darkColor: "#6dd162" },
  { label: "蓝色", lightColor: "#245bdb", darkColor: "#70a0ff" },
  { label: "紫色", lightColor: "#6425d0", darkColor: "#a472fc" },
];

export const TEXT_GRADIENT_OPTIONS: TextGradientOption[] = Object.values(TEXT_GRADIENT_PRESETS).map(
  preset => ({
    label: preset.label,
    preset: preset.id,
    previewLight: preset.light,
    previewDark: preset.dark,
  })
);

export const HIGHLIGHT_OPTIONS: HighlightOption[] = [
  { label: "默认", value: undefined, previewColor: "transparent" },
  { label: "黄色", value: "yellow", previewColor: "rgba(255, 212, 0, 0.6)" },
  { label: "绿色", value: "green", previewColor: "rgba(42, 157, 143, 0.6)" },
  { label: "蓝色", value: "blue", previewColor: "rgba(162, 210, 255, 0.8)" },
  { label: "紫色", value: "purple", previewColor: "rgba(157, 148, 200, 0.6)" },
  { label: "红色", value: "red", previewColor: "rgba(239, 35, 60, 0.5)" },
];

export const UNDERLINE_COLOR_OPTIONS: UnderlineColorOption[] = [
  { label: "默认", value: "default", previewColor: "#94a3b8" },
  { label: "黄色", value: "yellow", previewColor: "#facc15" },
  { label: "绿色", value: "green", previewColor: "#22c55e" },
  { label: "蓝色", value: "blue", previewColor: "#3b82f6" },
  { label: "紫色", value: "purple", previewColor: "#a855f7" },
  { label: "红色", value: "red", previewColor: "#ef4444" },
];

export const UNDERLINE_LINE_TYPE_OPTIONS: UnderlineLineTypeOption[] = [
  { label: "实线", value: "solid" },
  { label: "虚线", value: "dashed" },
  { label: "点线", value: "dotted" },
  { label: "波浪", value: "wavy" },
];

export function isMarkAction(actionId: ToolbarActionId): actionId is MarkActionId {
  return (
    actionId === "bold" ||
    actionId === "italic" ||
    actionId === "strikethrough" ||
    actionId === "code"
  );
}

export function isInlineWrapAction(actionId: ToolbarActionId): actionId is InlineWrapActionId {
  return actionId === "underline" || actionId === "link" || actionId === "styled-text";
}

export function isCustomMarkAction(actionId: ToolbarActionId): actionId is CustomMarkActionId {
  return actionId === "color" || actionId === "highlight";
}

const SELECTION_REQUIRED_ACTIONS = new Set<ToolbarActionId>([
  "underline",
  "styled-text",
  "color",
  "highlight",
  "kbd",
  "comment",
]);

export function isActionSelectionRequired(actionId: ToolbarActionId): boolean {
  return SELECTION_REQUIRED_ACTIONS.has(actionId);
}

export function restoreSelectionAndFocus(
  editor: Editor,
  lastSelection: BaseSelection | null
): BaseSelection | null {
  if (!editor.selection) {
    if (lastSelection) {
      Transforms.select(editor, lastSelection);
    }
  }

  ReactEditor.focus(editor as ReactEditor);

  // Android WebView 可能在 Slate 恢复选区后仍保留工具栏的原生焦点。
  if (typeof document !== "undefined") {
    try {
      const editorElement = ReactEditor.toDOMNode(editor as ReactEditor, editor) as HTMLElement;
      if (document.activeElement !== editorElement) {
        editorElement.focus({ preventScroll: true });
      }
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          if (editorElement.isConnected && document.activeElement !== editorElement) {
            editorElement.focus({ preventScroll: true });
          }
        });
      }
    } catch {
      // 编辑器尚未挂载到 DOM 时，Slate 焦点恢复仍然有效。
    }
  }
  return editor.selection ?? lastSelection;
}

export function toggleMark(editor: Editor, mark: MarkActionId): void {
  const marks = Editor.marks(editor) as Record<string, unknown> | null;
  if (marks && marks[mark]) {
    Editor.removeMark(editor, mark);
  } else {
    Editor.addMark(editor, mark, true);
  }

  if (editor.selection && !Range.isCollapsed(editor.selection)) {
    Transforms.collapse(editor, { edge: "end" });
  }
}

function collapseSelectionIfExpanded(editor: Editor): void {
  if (editor.selection && !Range.isCollapsed(editor.selection)) {
    Transforms.collapse(editor, { edge: "end" });
  }
}

function updateUnderlineLocalStyle(payload: UnderlineStylePayload): void {
  if (typeof window === "undefined") {
    return;
  }
  if (payload.color) {
    localStorage.setItem("underline-color", payload.color);
  }
  if (payload.lineType) {
    localStorage.setItem("underline-line-type", payload.lineType);
  }
}

function hasNodeType(editor: Editor, type: string): boolean {
  const selection = editor.selection;
  if (!selection) {
    return false;
  }
  const [entry] = Editor.nodes(editor, {
    at: selection,
    match: node =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === type,
  });
  return !!entry;
}

export function toggleKbd(editor: Editor): void {
  if (hasNodeType(editor, "kbd")) {
    unwrapKbd(editor);
  } else {
    wrapKbd(editor);
  }
  if (editor.selection) {
    Transforms.collapse(editor, { edge: "end" });
  }
}

export function toggleComment(editor: Editor): void {
  if (hasNodeType(editor, "comment")) {
    unwrapComment(editor);
  } else {
    wrapComment(editor);
  }
  if (editor.selection) {
    Transforms.collapse(editor, { edge: "end" });
  }
}

export function toggleInlineWrap(editor: Editor, actionId: InlineWrapActionId): void {
  if (actionId === "underline") {
    if (hasNodeType(editor, "underline")) {
      unwrapUnderline(editor);
    } else {
      wrapUnderline(editor);
    }
  } else if (actionId === "styled-text") {
    if (hasNodeType(editor, "styled-text")) {
      unwrapStyledText(editor);
    } else {
      wrapStyledText(editor);
    }
  } else if (actionId === "link") {
    // 链接浮层自己保存选区并负责新建 / 编辑（在链接里时编辑，取消链接在浮层内）
    openLinkPanel(editor);
    return;
  }

  collapseSelectionIfExpanded(editor);
}

const DEFAULT_LIGHT_COLOR = "#e33a32";
const DEFAULT_DARK_COLOR = "#fa7873";
const DEFAULT_HIGHLIGHT = "yellow";

export function applyColorMark(editor: Editor, lightColor?: string, darkColor?: string): void {
  const selection = editor.selection;
  const shouldClearInputMark =
    !!selection && !Range.isCollapsed(selection) && Boolean(lightColor || darkColor);
  if (lightColor || darkColor) {
    Editor.removeMark(editor, "textGradient");
    Editor.addMark(editor, "color", lightColor);
    Editor.addMark(editor, "darkColor", darkColor);
  } else {
    Editor.removeMark(editor, "textGradient");
    Editor.removeMark(editor, "color");
    Editor.removeMark(editor, "darkColor");
  }
  collapseSelectionIfExpanded(editor);
  if (shouldClearInputMark) {
    Editor.removeMark(editor, "textGradient");
    Editor.removeMark(editor, "color");
    Editor.removeMark(editor, "darkColor");
  }
}

export function applyGradientMark(editor: Editor, preset?: TextGradientPresetId): void {
  const selection = editor.selection;
  const shouldClearInputMark = !!selection && !Range.isCollapsed(selection) && Boolean(preset);
  if (preset) {
    Editor.removeMark(editor, "color");
    Editor.removeMark(editor, "darkColor");
    Editor.addMark(editor, "textGradient", preset);
  } else {
    Editor.removeMark(editor, "textGradient");
  }
  collapseSelectionIfExpanded(editor);
  if (shouldClearInputMark) {
    Editor.removeMark(editor, "textGradient");
  }
}

export function applyHighlightMark(editor: Editor, label?: string): void {
  const selection = editor.selection;
  const shouldClearInputMark = !!selection && !Range.isCollapsed(selection) && Boolean(label);
  if (label) {
    Editor.addMark(editor, "highlight", label);
  } else {
    Editor.removeMark(editor, "highlight");
  }
  collapseSelectionIfExpanded(editor);
  if (shouldClearInputMark) {
    Editor.removeMark(editor, "highlight");
  }
}

export function applyUnderlineStyle(editor: Editor, payload: UnderlineStylePayload): void {
  const selection = editor.selection;
  if (!selection) {
    updateUnderlineLocalStyle(payload);
    return;
  }

  const underlineEntries = Array.from(
    Editor.nodes(editor, {
      at: selection,
      match: node =>
        !Editor.isEditor(node) &&
        Element.isElement(node) &&
        (node as { type?: string }).type === "underline",
    })
  );

  if (underlineEntries.length > 0) {
    underlineEntries.forEach(([, path]) => {
      Transforms.setNodes(editor, payload, { at: path });
    });
    collapseSelectionIfExpanded(editor);
    updateUnderlineLocalStyle(payload);
    return;
  }

  updateUnderlineLocalStyle(payload);
  wrapUnderline(editor);
  collapseSelectionIfExpanded(editor);
}

export function toggleCustomMark(editor: Editor, actionId: CustomMarkActionId): void {
  const marks = Editor.marks(editor) as Record<string, unknown> | null;

  if (actionId === "color") {
    const active = Boolean(marks?.color || marks?.darkColor || marks?.textGradient);
    applyColorMark(
      editor,
      active ? undefined : DEFAULT_LIGHT_COLOR,
      active ? undefined : DEFAULT_DARK_COLOR
    );
    return;
  }

  const highlightActive = Boolean(marks?.highlight);
  applyHighlightMark(editor, highlightActive ? undefined : DEFAULT_HIGHLIGHT);
}

export function toggleContentLinkIfActive(editor: Editor): boolean {
  const selection = editor.selection;
  if (!selection) {
    return false;
  }
  const [activeContentLink] = Editor.nodes(editor, {
    at: selection,
    match: node =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === "content-link",
  });
  if (!activeContentLink) {
    return false;
  }
  Transforms.unwrapNodes(editor, {
    at: selection,
    split: true,
    match: node =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === "content-link",
  });
  if (editor.selection) {
    Transforms.collapse(editor, { edge: "end" });
  }
  return true;
}

export function isToolbarActionActive(editor: Editor, actionId: ToolbarActionId): boolean {
  if (!editor.selection) {
    return false;
  }
  if (isMarkAction(actionId)) {
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    return !!marks?.[actionId];
  }
  if (actionId === "underline") {
    return hasNodeType(editor, "underline");
  }
  if (actionId === "link") {
    return hasNodeType(editor, "link");
  }
  if (actionId === "styled-text") {
    return hasNodeType(editor, "styled-text");
  }
  if (actionId === "color") {
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    return Boolean(marks?.color || marks?.darkColor || marks?.textGradient);
  }
  if (actionId === "highlight") {
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    return Boolean(marks?.highlight);
  }
  if (actionId === "kbd") {
    return hasNodeType(editor, "kbd");
  }
  if (actionId === "comment") {
    return hasNodeType(editor, "comment");
  }
  if (actionId === "content-link") {
    return hasNodeType(editor, "content-link");
  }
  if (isBlockAction(actionId)) {
    if (actionId === "heading-one" || actionId === "heading-two" || actionId === "heading-three") {
      const entry = findBlockByType(editor, "header");
      const level = actionId === "heading-one" ? 1 : actionId === "heading-two" ? 2 : 3;
      return !!entry && entry[0].level === level;
    }
    if (actionId === "bulleted-list" || actionId === "numbered-list") {
      return hasNodeType(editor, actionId);
    }
    if (actionId === "quote") {
      return hasNodeType(editor, "blockquote");
    }
  }
  return false;
}
