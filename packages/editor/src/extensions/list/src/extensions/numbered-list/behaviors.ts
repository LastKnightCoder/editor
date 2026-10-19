import type { ElementBehaviors } from "@tau/editor/api";
import type { NumberedListElement, ParagraphElement } from "../../types";
import { insertListSyntax, normalizeListContainer } from "../../normalization";

export const numberedListBehaviors: ElementBehaviors<NumberedListElement> = {
  normalize: (editor, entry) => normalizeListContainer(editor, entry),
};

/** 段落开头输入 `1. `：变成有序列表（快捷语法，挂 paragraph 的行为上） */
export const numberedListForParagraph: ElementBehaviors<ParagraphElement> = {
  insertText: (editor, _entry, text) =>
    insertListSyntax(editor, text, "numbered-list", prefix => /^\d+\.$/.test(prefix)),
};
