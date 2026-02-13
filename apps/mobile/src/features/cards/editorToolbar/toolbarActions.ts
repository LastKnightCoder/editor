import {
  unwrapLink,
  unwrapStyledText,
  unwrapUnderline,
  wrapLink,
  wrapComment,
  wrapStyledText,
  wrapUnderline,
  unwrapComment,
  wrapKbd,
  unwrapKbd,
} from "@tau/editor/src/utils/insertElement";
import { Editor, Element, Range, Transforms, type BaseSelection } from "slate";
import { ReactEditor } from "slate-react";

export type MarkActionId = "bold" | "italic" | "strikethrough" | "code";
export type InlineWrapActionId = "underline" | "link" | "styled-text";
export type CustomMarkActionId = "color" | "highlight";
export type UnderlineColor =
  | "default"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "red";
export type UnderlineLineType = "solid" | "dashed" | "dotted" | "wavy";
export type UnderlineStylePayload = Partial<{
  color: UnderlineColor;
  lineType: UnderlineLineType;
}>;
export type ToolbarActionId =
  | MarkActionId
  | InlineWrapActionId
  | CustomMarkActionId
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

export function isMarkAction(
  actionId: ToolbarActionId,
): actionId is MarkActionId {
  return (
    actionId === "bold" ||
    actionId === "italic" ||
    actionId === "strikethrough" ||
    actionId === "code"
  );
}

export function isInlineWrapAction(
  actionId: ToolbarActionId,
): actionId is InlineWrapActionId {
  return (
    actionId === "underline" ||
    actionId === "link" ||
    actionId === "styled-text"
  );
}

export function isCustomMarkAction(
  actionId: ToolbarActionId,
): actionId is CustomMarkActionId {
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
  lastSelection: BaseSelection | null,
): BaseSelection | null {
  if (!editor.selection) {
    if (lastSelection) {
      Transforms.select(editor, lastSelection);
    }
  }

  ReactEditor.focus(editor as ReactEditor);
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
    match: (node) =>
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

export function toggleInlineWrap(
  editor: Editor,
  actionId: InlineWrapActionId,
): void {
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
    if (hasNodeType(editor, "link")) {
      unwrapLink(editor);
    } else {
      wrapLink(editor, "", true);
    }
  }

  collapseSelectionIfExpanded(editor);
}

const DEFAULT_LIGHT_COLOR = "#e33a32";
const DEFAULT_DARK_COLOR = "#fa7873";
const DEFAULT_HIGHLIGHT = "yellow";

export function applyColorMark(
  editor: Editor,
  lightColor?: string,
  darkColor?: string,
): void {
  const selection = editor.selection;
  const shouldClearInputMark =
    !!selection &&
    !Range.isCollapsed(selection) &&
    Boolean(lightColor || darkColor);
  if (lightColor || darkColor) {
    Editor.addMark(editor, "color", lightColor);
    Editor.addMark(editor, "darkColor", darkColor);
  } else {
    Editor.removeMark(editor, "color");
    Editor.removeMark(editor, "darkColor");
  }
  collapseSelectionIfExpanded(editor);
  if (shouldClearInputMark) {
    Editor.removeMark(editor, "color");
    Editor.removeMark(editor, "darkColor");
  }
}

export function applyHighlightMark(editor: Editor, label?: string): void {
  const selection = editor.selection;
  const shouldClearInputMark =
    !!selection && !Range.isCollapsed(selection) && Boolean(label);
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

export function applyUnderlineStyle(
  editor: Editor,
  payload: UnderlineStylePayload,
): void {
  const selection = editor.selection;
  if (!selection) {
    updateUnderlineLocalStyle(payload);
    return;
  }

  const underlineEntries = Array.from(
    Editor.nodes(editor, {
      at: selection,
      match: (node) =>
        !Editor.isEditor(node) &&
        Element.isElement(node) &&
        (node as { type?: string }).type === "underline",
    }),
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

export function toggleCustomMark(
  editor: Editor,
  actionId: CustomMarkActionId,
): void {
  const marks = Editor.marks(editor) as Record<string, unknown> | null;

  if (actionId === "color") {
    const active = Boolean(marks?.color || marks?.darkColor);
    applyColorMark(
      editor,
      active ? undefined : DEFAULT_LIGHT_COLOR,
      active ? undefined : DEFAULT_DARK_COLOR,
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
    match: (node) =>
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
    match: (node) =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === "content-link",
  });
  if (editor.selection) {
    Transforms.collapse(editor, { edge: "end" });
  }
  return true;
}

export function isToolbarActionActive(
  editor: Editor,
  actionId: ToolbarActionId,
): boolean {
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
    return Boolean(marks?.color || marks?.darkColor);
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
  return false;
}
