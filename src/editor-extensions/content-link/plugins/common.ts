import { Editor } from "slate";

export const withSetting = (editor: Editor) => {
  const { isInline } = editor;

  editor.isInline = (element) => {
    // @ts-ignore
    return element.type === "content-link" ? true : isInline(element);
  };

  return editor;
};
