import { Editor, Transforms } from "slate";
import { insertVideo } from "@editor/utils";
import { uploadResource } from "@/hooks/useUploadResource.ts";
import { message } from "antd";

export const pasteVideo = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    const { files } = data;
    if (files && files.length > 0) {
      const file = files[0];
      const [mime] = file.type.split("/");
      if (mime !== "video") {
        insertData(data);
        return;
      }
      const insertPath = insertVideo(editor, {
        src: "",
        uploading: true,
      });
      if (!insertPath) {
        return;
      }
      const src = await uploadResource(file);
      if (!src) {
        message.error("上传失败");
        Editor.withoutNormalizing(editor, () => {
          Transforms.delete(editor, {
            at: insertPath,
          });
          Transforms.insertNodes(
            editor,
            {
              type: "paragraph",
              children: [{ type: "formatted", text: "" }],
            },
            {
              at: insertPath,
              select: true,
            },
          );
        });
        return;
      }
      Transforms.setNodes(
        editor,
        {
          src,
          uploading: false,
        },
        {
          at: insertPath,
        },
      );
      return;
    }
    insertData(data);
  };

  return editor;
};
