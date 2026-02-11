import { Editor } from "slate";

export const withSetting = (editor: Editor) => {
  const { isInline, isVoid } = editor;

  editor.isInline = (element) => {
    return element.type === "flashcard-blank" ? true : isInline(element);
  };

  // flashcard-blank 不是 void 元素，可以包含文本
  editor.isVoid = (element) => {
    return element.type === "flashcard-blank" ? false : isVoid(element);
  };

  return editor;
};
