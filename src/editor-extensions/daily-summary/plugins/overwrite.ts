import { Editor } from "slate";

export const overwrite = (editor: Editor) => {
  const { isBlock, isVoid } = editor;

  editor.isBlock = element => {
    // @ts-ignore
    return element.type === 'daily-summary' ? true : isBlock(element);
  }

  editor.isVoid = element => {
    // @ts-ignore
    return element.type === 'daily-summary' ? true : isVoid(element);
  }

  return editor;
}
