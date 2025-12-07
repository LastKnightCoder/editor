import { Editor } from "slate";

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
      op.node.type === "inline-image" &&
      // @ts-ignore
      !editor.isResetValue &&
      contentId
    ) {
      // @ts-ignore
      const url = op.node.url;
      if (url) {
        editor.services?.resource.decrementRef(url);
      }
    }

    // 处理插入节点
    if (
      op.type === "insert_node" &&
      // @ts-ignore
      op.node.type === "inline-image" &&
      // @ts-ignore
      !editor.isResetValue &&
      contentId
    ) {
      // @ts-ignore
      const url = op.node.url;
      if (url) {
        editor.services?.resource.create({
          name: extractFileName(url),
          path: url,
          type: "image",
          source: { type: "content", id: contentId },
        });
      }
    }

    apply(op);
  };

  return editor;
};
