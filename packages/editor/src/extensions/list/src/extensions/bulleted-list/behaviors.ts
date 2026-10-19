import type { ElementBehaviors } from "@tau/editor/api";
import type { BulletedListElement, ParagraphElement } from "../../types";
import { insertListSyntax, normalizeListContainer } from "../../normalization";

export const bulletedListBehaviors: ElementBehaviors<BulletedListElement> = {
  normalize: (editor, entry) => normalizeListContainer(editor, entry),
};

/** 段落开头输入 `- ` / `* ` / `+ `：变成无序列表（快捷语法，挂 paragraph 的行为上） */
export const bulletedListForParagraph: ElementBehaviors<ParagraphElement> = {
  insertText: (editor, _entry, text) =>
    insertListSyntax(editor, text, "bulleted-list", prefix => ["-", "*", "+"].includes(prefix)),
};
