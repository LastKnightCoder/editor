import { Editor } from "slate";

export const withSetting = (editor: Editor) => {
  const { isVoid, isInline } = editor;

  editor.isVoid = (element: any) => {
    return element.type === "whiteboard" ? true : isVoid(element);
  };

  editor.isInline = (element: any) => {
    return element.type === "whiteboard" ? false : isInline(element);
  };

  return editor;
};
