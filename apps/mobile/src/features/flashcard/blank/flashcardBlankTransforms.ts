// flashcard-blank 行内节点的 Slate 操作（移植自桌面 ClozeRichEditor/utils.ts）。
// 建卡页「设为填空」按钮使用；复习侧的填空提取/判分用 reviewFlow.extractBlanks，勿在此重复。

import { Editor, Element as SlateElement, Range, Transforms } from "slate";
import type { Descendant } from "slate";
import { genId } from "../cardDraft";

export interface FlashcardBlankElement {
  type: "flashcard-blank";
  blankId: string;
  placeholder: string;
  answer: string;
  alternativeAnswers?: string[];
  children: Descendant[];
}

export const isBlankElement = (node: unknown): node is FlashcardBlankElement =>
  SlateElement.isElement(node) && node.type === "flashcard-blank";

export type ToggleBlankResult = "needs-selection" | "wrapped" | "unwrapped";

/** 选中文本 ↔ 填空标记互切换：选区落在已有填空内 → 解除标记，否则把选中文本包成填空 */
export function toggleBlank(editor: Editor): ToggleBlankResult {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection)) {
    return "needs-selection";
  }

  const [existingBlank] = Editor.nodes(editor, { at: selection, match: isBlankElement });
  if (existingBlank) {
    Transforms.unwrapNodes(editor, { match: isBlankElement });
    return "unwrapped";
  }

  const answer = Editor.string(editor, selection);
  const blank: FlashcardBlankElement = {
    type: "flashcard-blank",
    blankId: genId(),
    placeholder: "",
    answer,
    alternativeAnswers: [],
    children: [],
  };
  Transforms.wrapNodes(editor, blank, { at: selection, split: true });
  return "wrapped";
}
