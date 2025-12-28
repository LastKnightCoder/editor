import { Editor, Transforms, Element as SlateElement, Path } from "slate";
import { message } from "antd";
import { insertAudio } from "../../../utils";

/**
 * 查找最近插入的上传中的音频节点
 * （通过 src 为空且 uploading 为 true 来识别）
 */
function findUploadingAudioNode(
  editor: Editor,
  startPath: Path,
): [any, Path] | null {
  const nodeEntries = Array.from(
    Editor.nodes(editor, {
      at: [],
      match: (n: any) =>
        SlateElement.isElement(n) &&
        n.type === "audio" &&
        n.src === "" &&
        n.uploading === true,
    }),
  );

  // 查找与 startPath 匹配的节点
  for (const entry of nodeEntries) {
    if (Path.equals(entry[1], startPath)) {
      return entry as [any, Path];
    }
  }

  // 如果找不到精确匹配，返回第一个上传中的节点
  return nodeEntries[0] as [any, Path] | null;
}

/**
 * 音频拖放处理插件
 *
 * 注册音频文件的拖放处理器，复用粘贴插件的上传逻辑
 */
export const dropAudio = (editor: Editor) => {
  // 初始化 dropHandlers 对象
  if (!editor.dropHandlers) {
    editor.dropHandlers = {};
  }

  // 注册音频文件处理器
  editor.dropHandlers.audio = async (file: File) => {
    // 插入占位节点
    const insertPath = insertAudio(editor, {
      src: "",
      uploading: true,
    });

    if (!insertPath) {
      return;
    }

    try {
      // 上传文件 (audio 使用 file.uploadFile 服务)
      const src = await editor.services?.file.uploadFile(file);

      if (!src) {
        throw new Error("上传失败");
      }

      // 查找并更新节点
      const nodeEntry = findUploadingAudioNode(editor, insertPath);
      if (nodeEntry) {
        Transforms.setNodes(
          editor,
          {
            src,
            uploading: false,
          },
          {
            at: nodeEntry[1],
          },
        );
      } else {
        console.error("无法找到上传中的音频节点");
        message.error("音频更新失败");
      }
    } catch (error) {
      console.error("音频上传失败:", error);
      message.error("音频上传失败");

      // 查找并标记上传失败
      const nodeEntry = findUploadingAudioNode(editor, insertPath);
      if (nodeEntry) {
        Transforms.setNodes(
          editor,
          {
            uploading: false,
          },
          {
            at: nodeEntry[1],
          },
        );
      }
    }
  };

  return editor;
};
