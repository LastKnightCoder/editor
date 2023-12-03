import { Editor, Transforms } from "slate";
import { insertImage } from "@/components/Editor/utils";
import { uploadImage } from "@/hooks/useUploadImage.ts";
import { message } from "antd";

export const pasteImage = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    const { files } = data;
    if (files && files.length > 0) {
      const file = files[0];
      const [mime] = file.type.split('/');
      if (mime !== 'image') {
        insertData(data);
        return;
      }
      const insertPath = insertImage(editor, {
        url: '',
        pasteUploading: true,
      });
      if (!insertPath) {
        return;
      }
      const url = await uploadImage(file);
      if (!url) {
        message.error('上传失败');
        Transforms.setNodes(editor, {
          pasteUploading: false
        }, {
          at: insertPath
        });
        return;
      }
      Transforms.setNodes(editor, {
        url,
        pasteUploading: false
      }, {
        at: insertPath
      });
      return;
    }
    insertData(data);
  }

  return editor;
}
