import { Editor, Transforms, Range, Element as SlateElement } from "slate";
import type { Descendant } from "slate";
import type { FlashcardBlankElement } from "@tau/editor/src";

// 生成唯一ID
const genId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

/**
 * 将选中文本标记为空格
 */
export const wrapAsBlank = (editor: Editor) => {
  const { selection } = editor;

  if (!selection || Range.isCollapsed(selection)) {
    return;
  }

  // 检查选区是否包含已有空格
  const [existingBlank] = Editor.nodes(editor, {
    at: selection,
    match: (n) =>
      !Editor.isEditor(n) &&
      SlateElement.isElement(n) &&
      n.type === "flashcard-blank",
  });

  if (existingBlank) {
    alert("选区包含已有空格，请先解除标记");
    return;
  }

  const selectedText = Editor.string(editor, selection);
  const blankId = genId();
  const uuid = genId();

  const blankElement: Omit<FlashcardBlankElement, "children"> & {
    children: [];
  } = {
    type: "flashcard-blank",
    blankId,
    placeholder: "",
    answer: selectedText, // 默认答案为选中的文本
    alternativeAnswers: [],
    uuid,
    children: [],
  };

  Transforms.wrapNodes(editor, blankElement as FlashcardBlankElement, {
    at: selection,
    split: true,
  });
};

/**
 * 取消空格标记
 */
export const unwrapBlank = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: (n) =>
      !Editor.isEditor(n) &&
      SlateElement.isElement(n) &&
      n.type === "flashcard-blank",
  });
};

/**
 * 从 richContent 提取所有空格到数组
 */
export const extractBlanksFromRichContent = (
  richContent: Descendant[],
): FlashcardBlankElement[] => {
  const blanks: FlashcardBlankElement[] = [];

  const traverse = (node: any) => {
    if (node.type === "flashcard-blank") {
      blanks.push(node as FlashcardBlankElement);
    }

    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  };

  richContent.forEach(traverse);
  return blanks;
};
