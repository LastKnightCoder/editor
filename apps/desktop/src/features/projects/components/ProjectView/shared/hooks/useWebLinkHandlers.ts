import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import { createWebLink, getFileBaseName, readTextFile, selectFile } from "@/commands";
import { WebLinkSourceType } from "@/types";

export interface WebviewFileResult {
  url: string;
  fileName: string;
  title: string;
}

export interface UseWebLinkHandlersOptions {
  uploadResource: (file: File) => Promise<string | null>;
  /**
   * 用于区分不同组件的 message key 前缀
   * @default "weblink"
   */
  messageKeyPrefix?: string;
}

/**
 * WebLink 相关操作的共享 hook
 * 提取 ProjectList 和 ProjectItem 中重复的 WebLink 处理逻辑
 */
export const useWebLinkHandlers = (options: UseWebLinkHandlersOptions) => {
  const { uploadResource, messageKeyPrefix = "weblink" } = options;

  /**
   * 创建 WebLink 记录
   */
  const createWebLinkRecord = useMemoizedFn(
    async (title: string, url: string, sourceType: WebLinkSourceType) => {
      const finalTitle = title.trim() || url;
      return await createWebLink({
        title: finalTitle,
        url,
        sourceType,
      });
    }
  );

  /**
   * 选择并上传 HTML 文件作为 Webview
   */
  const handleSelectWebviewFile = useMemoizedFn(async (): Promise<WebviewFileResult | null> => {
    const filePaths = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "HTML",
          extensions: ["html", "htm"],
        },
      ],
    });

    if (!filePaths || filePaths.length === 0) return null;

    const filePath = filePaths[0];
    const messageKey = `${messageKeyPrefix}-webview-html`;

    try {
      message.loading({
        key: messageKey,
        content: "正在上传 HTML 文件...",
        duration: 0,
      });

      const fileName = await getFileBaseName(filePath);
      const fileTitle = await getFileBaseName(filePath, true);
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent], fileName, {
        type: "text/html",
      });

      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        message.error({
          key: messageKey,
          content: "上传 HTML 文件失败",
        });
        return null;
      }

      message.success({
        key: messageKey,
        content: "HTML 文件已添加",
      });

      return {
        url: uploadedUrl,
        fileName,
        title: fileTitle || fileName,
      };
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      message.error({
        key: messageKey,
        content: "选择 HTML 文件失败",
      });
      return null;
    }
  });

  return {
    createWebLinkRecord,
    handleSelectWebviewFile,
  };
};
