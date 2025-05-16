import { Editor } from "slate";
import { insertInlineImage } from "@/components/Editor/utils/insertElement";
import { handlePasteImage } from "@/components/Editor/utils/pasteImage";

export const pasteInlineImagePlugin = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    const insertBlockImageFn = () => {
      return undefined;
    };

    const insertInlineImageFn = (editor: Editor, url: string, uuid: string) => {
      insertInlineImage(editor, { url, uuid });
      return true;
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
