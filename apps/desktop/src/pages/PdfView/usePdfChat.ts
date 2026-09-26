import { useEffect } from "react";
import toolRegistry from "@/tools";
import {
  createGetPdfAnnotationsTool,
  createGetPdfBookmarksTool,
  createGetPdfDocumentInfoTool,
  createGetPdfOutlineTool,
  createPdfSearchTool,
  createReadPdfPageRangeTool,
} from "@/tools/pdfSearchTool";

/** 注册页面专属工具，返回工具作用域：交给本页对话的 ChatContainer toolScope，别的对话拿不到 */
export const usePdfChat = (pdfId: number, mainDbName: string) => {
  const sourceId = `pdf-${pdfId}`;
  useEffect(() => {
    const tools = [
      createPdfSearchTool(pdfId, mainDbName),
      createGetPdfDocumentInfoTool(pdfId, mainDbName),
      createGetPdfOutlineTool(pdfId, mainDbName),
      createReadPdfPageRangeTool(pdfId, mainDbName),
      createGetPdfAnnotationsTool(pdfId),
      createGetPdfBookmarksTool(pdfId),
    ];

    toolRegistry.registerScopedTools(sourceId, "PDF 文档", tools);
    return () => {
      toolRegistry.unregisterSource(sourceId);
    };
  }, [sourceId, pdfId, mainDbName]);

  return sourceId;
};

export default usePdfChat;
