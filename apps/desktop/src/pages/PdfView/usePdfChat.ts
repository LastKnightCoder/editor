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

export const usePdfChat = (pdfId: number, mainDbName: string) => {
  useEffect(() => {
    const sourceId = `pdf-${pdfId}`;
    const tools = [
      createPdfSearchTool(pdfId, mainDbName),
      createGetPdfDocumentInfoTool(pdfId, mainDbName),
      createGetPdfOutlineTool(pdfId, mainDbName),
      createReadPdfPageRangeTool(pdfId, mainDbName),
      createGetPdfAnnotationsTool(pdfId),
      createGetPdfBookmarksTool(pdfId),
    ];

    toolRegistry.registerTools(sourceId, tools, true);
    return () => {
      toolRegistry.unregisterSource(sourceId);
    };
  }, [pdfId, mainDbName]);
};

export default usePdfChat;
