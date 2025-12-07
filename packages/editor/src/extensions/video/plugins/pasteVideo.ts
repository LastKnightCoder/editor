import { Editor, Transforms } from "slate";
import { insertVideo } from "../../../utils";
import { message } from "antd";

export const pasteVideo = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    const { files } = data;

    const uploadResource = editor.services?.resource.upload;

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
      const res = await uploadResource?.(file);
      if (!res) {
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
          src: res.url,
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
