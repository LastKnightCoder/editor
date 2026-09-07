import { Editor, Transforms, Element as SlateElement } from "slate";
import { v4 as uuidv4 } from "uuid";
import { message } from "antd";
import { insertImage } from "../../../utils";
import { IResourceService } from "../../../services";

/**
 * 通过uuid查找并更新图片节点
 */
function updateImageByUuid(editor: Editor, uuid: string, properties: Record<string, any>): boolean {
  const nodeEntries = Array.from(
    Editor.nodes(editor, {
      at: [],
      match: (n: any) =>
        SlateElement.isElement(n) && n.type === "image" && (n as any).uuid === uuid,
    })
  );

  if (nodeEntries.length > 0) {
    const nodeEntry = nodeEntries[0];
    Transforms.setNodes(editor, properties, { at: nodeEntry[1] });
    return true;
  }

  return false;
}

/**
 * 图片拖放处理插件
 *
 * 注册图片文件的拖放处理器，复用粘贴插件的上传逻辑
 */
export const dropImage = (editor: Editor) => {
  // 初始化 dropHandlers 对象
  if (!editor.dropHandlers) {
    editor.dropHandlers = {};
  }

  // 注册图片文件处理器
  editor.dropHandlers.image = async (file: File) => {
    const uuid = uuidv4();

    // 插入占位节点
    const insertPath = insertImage(editor, {
      url: "",
      uuid,
      pasteUploading: true,
    });

    if (!insertPath) {
      return;
    }

    try {
      // 上传文件
      const url = await editor.getService(IResourceService).upload(file);

      if (!url) {
        throw new Error("上传失败");
      }

      // 使用 UUID 查找并更新节点（避免并行上传时路径失效）
      const updated = updateImageByUuid(editor, uuid, {
        url,
        pasteUploading: false,
      });

      if (!updated) {
        console.error("无法找到UUID为", uuid, "的图片节点");
        message.error("图片更新失败");
      }
    } catch (error) {
      console.error("图片上传失败:", error);
      message.error("图片上传失败");

      // 使用 UUID 查找并标记上传失败
      updateImageByUuid(editor, uuid, {
        pasteUploading: false,
      });
    }
  };

  return editor;
};
