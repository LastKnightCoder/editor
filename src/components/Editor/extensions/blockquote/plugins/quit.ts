import { Editor } from "slate";
import { hitDoubleQuit } from "@/components/Editor/extensions/utils.ts";

export const quit = (editor: Editor) => {
  const { insertBreak } = editor;

  // 当在最后一个空段落按下回车是删除当前段落，并来到下一个空段落
  editor.insertBreak = () => {
    if (hitDoubleQuit(editor, "blockquote")) {
      return;
    }

    return insertBreak();
  };

  return editor;
};
