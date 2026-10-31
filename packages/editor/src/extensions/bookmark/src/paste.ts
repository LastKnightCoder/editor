import { Editor, Element, Node, Path, Range, Transforms, type PathRef } from "slate";
import { isTouchInteraction } from "@tau/editor/api";
import { isLinkElement, isPastedUrl, pasteUrl } from "@tau/editor/extensions/link";

import { replaceParagraphWithBookmark } from "./operations";
import { normalizeBookmarkUrl } from "./url";

export type PasteChoice = "link" | "bookmark" | "text";

export interface PasteMenuState {
  paragraph: PathRef;
  /** 链接里的规范化地址 */
  url: string;
  /** 剪贴板原文，选「纯文本」时还原 */
  text: string;
}

type Listener = () => void;

/** 每个编辑器一份「粘贴为」菜单状态；菜单层订阅，粘贴认领写入。 */
class PasteMenuController {
  private state: PasteMenuState | null = null;
  private listeners = new Set<Listener>();

  getState = () => this.state;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  open(state: PasteMenuState) {
    this.state?.paragraph.unref();
    this.state = state;
    this.emit();
  }
  close = () => {
    if (!this.state) return;
    this.state.paragraph.unref();
    this.state = null;
    this.emit();
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
}

const controllers = new WeakMap<Editor, PasteMenuController>();
export const pasteMenuOf = (editor: Editor) => {
  let controller = controllers.get(editor);
  if (!controller) controllers.set(editor, (controller = new PasteMenuController()));
  return controller;
};

/** 光标所在的空段落；不是空段落返回 undefined */
const emptyParagraphAt = (editor: Editor): Path | undefined => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return undefined;
  const entry = Editor.above(editor, {
    at: selection.anchor,
    match: node => Element.isElement(node) && node.type === "paragraph",
  });
  if (!entry || entry[1].length !== 1) return undefined;
  return Node.string(entry[0]) === "" && entry[0].children.length === 1 ? entry[1] : undefined;
};

/** 只认领顶层空段落里的单个网址粘贴；行内粘贴和触屏宿主交给链接扩展。 */
export const claimsBookmarkPaste = (data: DataTransfer, editor: Editor): boolean =>
  !isTouchInteraction(editor) &&
  isPastedUrl(data.getData("text/plain")) &&
  emptyParagraphAt(editor) !== undefined;

/** 先按链接粘贴（默认结果），再弹出「粘贴为」菜单。 */
export const runBookmarkPaste = (editor: Editor, data: DataTransfer): void => {
  const path = emptyParagraphAt(editor);
  const text = data.getData("text/plain");
  pasteUrl(editor, text);
  if (!path) return;
  pasteMenuOf(editor).open({
    paragraph: Editor.pathRef(editor, path),
    url: normalizeBookmarkUrl(text),
    text: text.trim(),
  });
};

/** 段落仍只含这次粘贴出的链接时，返回该链接的路径 */
const pastedLinkPath = (editor: Editor, state: PasteMenuState): Path | undefined => {
  const path = state.paragraph.current;
  if (!path || !Node.has(editor, path)) return undefined;
  const paragraph = Node.get(editor, path);
  if (!Element.isElement(paragraph) || paragraph.type !== "paragraph") return undefined;
  const links = paragraph.children
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => isLinkElement(child));
  const others = paragraph.children.filter(
    child => !isLinkElement(child) && Node.string(child) !== ""
  );
  if (links.length !== 1 || others.length) return undefined;
  const link = links[0].child;
  return isLinkElement(link) && link.url === state.url ? [...path, links[0].index] : undefined;
};

export const applyPasteChoice = (editor: Editor, choice: PasteChoice): void => {
  const controller = pasteMenuOf(editor);
  const state = controller.getState();
  if (!state) return;
  const linkPath = choice === "link" ? undefined : pastedLinkPath(editor, state);
  const paragraph = state.paragraph.current;
  controller.close();
  if (!linkPath || !paragraph) return;
  if (choice === "bookmark") {
    replaceParagraphWithBookmark(editor, paragraph, state.url);
    return;
  }
  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: linkPath });
    Transforms.insertText(editor, state.text, { at: Editor.start(editor, paragraph) });
  });
  Transforms.select(editor, Editor.end(editor, paragraph));
};
