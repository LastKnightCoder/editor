import type { ElementBehaviors } from "../../api";
import type { HighlightBlockElement } from "../../types";
import { hitDoubleQuit, hitEmptyOrInlineChild } from "../utils";

/** 最后一个空段落里回车：退出高亮块（首段 lift，其余删段并在下方补空段落） */
const insertBreak: ElementBehaviors<HighlightBlockElement>["insertBreak"] = editor =>
  hitDoubleQuit(editor, "highlight-block");

/** 高亮块的子节点只允许块级元素：空 / 裸文本子节点清掉或包进段落 */
const normalize: ElementBehaviors<HighlightBlockElement>["normalize"] = (editor, entry) =>
  hitEmptyOrInlineChild(editor, entry, "highlight-block");

export const highlightBlockBehaviors: ElementBehaviors<HighlightBlockElement> = {
  insertBreak,
  normalize,
};
