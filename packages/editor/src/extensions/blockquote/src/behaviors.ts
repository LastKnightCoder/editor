import { Editor, Transforms, type NodeEntry } from "slate";

import type { ElementBehaviors } from "@tau/editor/api";
import type { BlockquoteElement, FormattedText, ParagraphElement } from "./types";
import {
  exitContainerOnEmptyParagraph,
  hitEmptyOrInlineChild,
  getParagraphShortcutEntry,
} from "@tau/editor/api";

/** 最后一个空段落里回车：退出 blockquote（首段 lift，其余删段并在下方补空段落） */
const insertBreak: ElementBehaviors<BlockquoteElement>["insertBreak"] = editor =>
  exitContainerOnEmptyParagraph(editor, "blockquote");

/** blockquote 的子节点只允许块级元素：空 / 裸文本子节点清掉或包进段落 */
const normalize: ElementBehaviors<BlockquoteElement>["normalize"] = (editor, entry) =>
  hitEmptyOrInlineChild(editor, entry, "blockquote");

export const blockquoteBehaviors: ElementBehaviors<BlockquoteElement> = {
  insertBreak,
  normalize,
};

/** 段落开头输入 `> `：删掉 `>` 并把段落包进 blockquote（快捷语法，挂 paragraph 的行为上） */
const insertMarkdownSyntax: ElementBehaviors<ParagraphElement>["insertText"] = (
  editor,
  _entry,
  text
) => {
  const match = getParagraphShortcutEntry(editor, text);
  if (!match) return false;
  const [node, path] = match as NodeEntry<FormattedText>;
  const offset = editor.selection!.anchor.offset;
  if ((node as FormattedText).text.slice(0, offset) !== ">") return false;
  Editor.withoutNormalizing(editor, () => {
    Transforms.delete(editor, {
      at: { anchor: { path, offset: 0 }, focus: { path, offset: 1 } },
    });
    Transforms.wrapNodes(editor, { type: "blockquote", children: [] });
  });
  return true;
};

export const blockquoteForParagraph: ElementBehaviors<ParagraphElement> = {
  insertText: insertMarkdownSyntax,
};
