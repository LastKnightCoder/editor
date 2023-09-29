import {Editor} from "slate";

export const commonSetting = (editor: Editor) => {
  const { isBlock } = editor;

  editor.isBlock = (element) => {
    return element.type === 'paragraph' ? true : isBlock(element);
  }

  return editor;
}