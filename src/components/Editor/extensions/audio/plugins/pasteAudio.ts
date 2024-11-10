import { Editor, Transforms } from "slate";
import { insertAudio } from "@editor/utils";
import { uploadImage } from "@/hooks/useUploadImage.ts";
import { message } from "antd";

export const pasteAudio = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    const { files } = data;
    if (files && files.length > 0) {
      const file = files[0];
      const [mime] = file.type.split('/');
      if (mime !== 'audio') {
        insertData(data);
        return;
      }
      const insertPath = insertAudio(editor, {
        src: '',
        uploading: true,
      });
      if (!insertPath) {
        return;
      }
      const src = await uploadImage(file);
      if (!src) {
        message.error('上传失败');
        Transforms.setNodes(editor, {
          uploading: false
        }, {
          at: insertPath
        });
        return;
      }
      Transforms.setNodes(editor, {
        src,
        uploading: false
      }, {
        at: insertPath
      });
      return;
    }
    insertData(data);
  }

  return editor;
}
