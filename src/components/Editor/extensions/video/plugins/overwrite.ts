import { Editor } from "slate";
import { createOrUpdateResource, decrementResourceRefCount } from "@/commands";

// 辅助函数：从路径提取文件名
const extractFileName = (pathOrUrl: string): string => {
  if (!pathOrUrl) return "未命名资源";

  try {
    const url = new URL(pathOrUrl);
    const pathname = url.pathname;
    const filename = pathname.substring(pathname.lastIndexOf("/") + 1);
    return decodeURIComponent(filename) || "未命名资源";
  } catch {
    const parts = pathOrUrl.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || "未命名资源";
  }
};

// 辅助函数：获取内容 ID
const getContentId = (editor: Editor): number | null => {
  // @ts-ignore
  if (editor.contentId) {
    // @ts-ignore
    return editor.contentId;
  }
  return null;
};

export const overwrite = (editor: Editor) => {
  const { apply } = editor;

  editor.apply = (op) => {
    const contentId = getContentId(editor);

    // 处理删除节点
    if (
      op.type === "remove_node" &&
      // @ts-ignore
      op.node.type === "video" &&
      // @ts-ignore
      !editor.isResetValue &&
      contentId
    ) {
      // @ts-ignore
      const src = op.node.src;
      if (src) {
        decrementResourceRefCount(src);
      }
    }

    // 处理插入节点
    if (
      op.type === "insert_node" &&
      // @ts-ignore
      op.node.type === "video" &&
      // @ts-ignore
      !editor.isResetValue &&
      contentId
    ) {
      // @ts-ignore
      const src = op.node.src;
      if (src) {
        createOrUpdateResource({
          name: extractFileName(src),
          path: src,
          type: "video",
          source: { type: "content", id: contentId },
        });
      }
    }

    apply(op);
  };

  return editor;
};
