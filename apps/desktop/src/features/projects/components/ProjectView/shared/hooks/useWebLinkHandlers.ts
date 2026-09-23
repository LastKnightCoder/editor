import { useMemoizedFn } from "ahooks";
import { createWebLink, getFileBaseName, readTextFile, selectFile } from "@/commands";
import { WebLinkSourceType } from "@/types";
import { toast } from "@tau/ui";

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
}

/**
 * WebLink 相关操作的共享 hook
 * 提取 ProjectList 和 ProjectItem 中重复的 WebLink 处理逻辑
 */
export const useWebLinkHandlers = (options: UseWebLinkHandlersOptions) => {
  const { uploadResource } = options;

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

    const loadingId = toast.loading("正在上传 HTML 文件...");
    try {
      const fileName = await getFileBaseName(filePath);
      const fileTitle = await getFileBaseName(filePath, true);
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent], fileName, {
        type: "text/html",
      });

      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        toast.dismiss(loadingId);
        toast.error("上传 HTML 文件失败");
        return null;
      }

      toast.resolve(loadingId, "HTML 文件已添加");

      return {
        url: uploadedUrl,
        fileName,
        title: fileTitle || fileName,
      };
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      toast.dismiss(loadingId);
      toast.error("选择 HTML 文件失败");
      return null;
    }
  });

  return {
    createWebLinkRecord,
    handleSelectWebviewFile,
  };
};
