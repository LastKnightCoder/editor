import { Editor, Transforms, Path, Element as SlateElement } from "slate";
import { v4 as uuidv4 } from "uuid";
import { message } from "antd";
import { isParagraphAndEmpty } from "./editor";

/**
 * 通用的粘贴图片处理函数
 */
export async function handlePasteImage(
  editor: Editor,
  data: DataTransfer,
  insertBlockImage: (
    editor: Editor,
    url: string,
    uuid: string,
  ) => Path | null | undefined,
  insertInlineImage: (editor: Editor, url: string, uuid: string) => boolean,
): Promise<boolean> {
  const { files } = data;
  if (!files || files.length === 0) {
    return false;
  }

  const file = files[0];
  const [mime] = file.type.split("/");
  if (mime !== "image") {
    return false;
  }

  const uploadResource = (editor as any)._uploadResource;
  if (!uploadResource) {
    return false;
  }

  const uuid = uuidv4();
  const isEmptyParagraph = isParagraphAndEmpty(editor);

  try {
    if (isEmptyParagraph) {
      const insertPath = insertBlockImage(editor, "", uuid);
      if (!insertPath) {
        return false;
      }

      const url = await uploadResource(file);
      if (!url) {
        message.error("图片上传失败");
        Transforms.setNodes(
          editor,
          { pasteUploading: false },
          { at: insertPath },
        );
        return true;
      }

      Transforms.setNodes(
        editor,
        { url, pasteUploading: false },
        { at: insertPath },
      );
      return true;
    } else {
      const insertInlineImageResult = insertInlineImage(editor, "", uuid);
      if (!insertInlineImageResult) {
        return false;
      }

      const url = await uploadResource(file);
      if (!url) {
        message.error("图片上传失败");
        updateNodeByUuid(editor, uuid, "inline-image", { url: "" });
        return true;
      }

      updateNodeByUuid(editor, uuid, "inline-image", { url });
      return true;
    }
  } catch (error) {
    console.error("图片处理失败:", error);
    message.error("图片处理错误");
    return true;
  }
}

/**
 * 通过uuid查找并更新指定类型的节点
 */
export function updateNodeByUuid(
  editor: Editor,
  uuid: string,
  type: string,
  properties: Record<string, any>,
): boolean {
  const nodeEntries = Array.from(
    Editor.nodes(editor, {
      at: [],
      match: (n: any) =>
        SlateElement.isElement(n) &&
        n.type === type &&
        (n as any).uuid === uuid,
    }),
  );

  if (nodeEntries.length > 0) {
    const nodeEntry = nodeEntries[0];
    Transforms.setNodes(editor, properties, { at: nodeEntry[1] });
    return true;
  }

  return false;
}
