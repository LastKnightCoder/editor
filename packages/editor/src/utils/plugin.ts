import { Editor } from "slate";

export type Plugin = (editor: Editor) => Editor;

export const applyPlugin = (editor: Editor, plugins: Plugin[]) => {
  return plugins.reduce((acc, plugin) => plugin(acc), editor);
};

export const createBlockElementPlugin = (type: string) => {
  return (editor: Editor) => {
    const { isBlock } = editor;

    editor.isBlock = (element) => {
      return element.type === type ? true : isBlock(element);
    };

    return editor;
  };
};

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
