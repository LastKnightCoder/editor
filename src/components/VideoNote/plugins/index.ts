import { Editor } from "slate";

export const createInlineElementPlugin = (type: string) => {
  return (editor: Editor) => {
    const { isInline } = editor;

    editor.isInline = (element) => {
      return element.type === type ? true : isInline(element);
    };

    return editor;
  };
};

export const createVoidElementPlugin = (type: string) => {
  return (editor: Editor) => {
    const { isVoid } = editor;

    editor.isVoid = (element) => {
      return element.type === type ? true : isVoid(element);
    };

    return editor;
  };
};
