import { Editor, Transforms } from "slate";

import type { ElementBehaviors } from "../../api";
import type { DetailElement, ParagraphElement } from "../../types";
import { hitDoubleQuit, hitEmptyOrInlineChild } from "../utils";
import { getPreviousSiblingNode, isAtParagraphStart, isParagraphElement } from "../../utils";

/** detail 内第一个段落的开头退格：unwrap detail（内容提出来） */
const unwrapAtFirstParagraph: ElementBehaviors<DetailElement>["deleteBackward"] = editor => {
  const [para] = Editor.nodes(editor, {
    match: n => isParagraphElement(n),
    mode: "lowest",
  });
  if (!para) return false;
  const [, path] = para;
  if (
    path[path.length - 1] !== 0 ||
    !editor.selection ||
    !Editor.isStart(editor, editor.selection.anchor, path)
  ) {
    return false;
  }
  Transforms.unwrapNodes(editor, {
    match: n => n.type === "detail",
    mode: "lowest",
    split: true,
  });
  return true;
};

/** 最后一个空段落里回车：退出 detail（首段 lift，其余删段并在下方补空段落） */
const insertBreak: ElementBehaviors<DetailElement>["insertBreak"] = editor =>
  hitDoubleQuit(editor, "detail");

/** detail 的子节点只允许块级元素：空 / 裸文本子节点清掉或包进段落 */
const normalize: ElementBehaviors<DetailElement>["normalize"] = (editor, entry) =>
  hitEmptyOrInlineChild(editor, entry, "detail");

export const detailBehaviors: ElementBehaviors<DetailElement> = {
  deleteBackward: unwrapAtFirstParagraph,
  insertBreak,
  normalize,
};

/** 段首退格且前一个兄弟块是 detail：吞掉退格，不把内容并进 detail（知识属于 detail，挂在 paragraph 上） */
const blockBeforeDetail: ElementBehaviors<ParagraphElement>["deleteBackward"] = (
  editor,
  [node]
) => {
  if (!isAtParagraphStart(editor)) return false;
  const prevSiblingNode = getPreviousSiblingNode(editor, node);
  if (!prevSiblingNode) return false;
  return prevSiblingNode[0].type === "detail";
};

export const detailForParagraph: ElementBehaviors<ParagraphElement> = {
  deleteBackward: blockBeforeDetail,
};
