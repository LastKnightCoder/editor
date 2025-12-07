import { Editor } from "slate";
import { insertImage } from "../../../utils";
import { handlePasteImage } from "../../../utils/pasteImage";

export const pasteImage = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    const insertBlockImageFn = (editor: Editor, url: string, uuid: string) => {
      return insertImage(editor, { url, uuid, pasteUploading: true });
    };

    const insertInlineImageFn = () => {
      // 空实现，块级图片插件不处理行内图片
      return false;
    };

    const handled = await handlePasteImage(
      editor,
      data,
      insertBlockImageFn,
      insertInlineImageFn,
    );

    if (handled) {
      return;
    }

    insertData(data);
  };

  return editor;
};
