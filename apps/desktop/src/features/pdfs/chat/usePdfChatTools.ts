import { mcpMetadataT } from "@/features/mcp/metadata.binding";
import { useEffect } from "react";
import type { Pdf } from "@/types";
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
export function usePdfChatTools(pdfId: number, mainDbName: string) {
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

    toolRegistry.registerScopedTools(sourceId, "PDF 文档", tools, {
      getLabel: () => mcpMetadataT("source.pdf"),
    });
    return () => {
      toolRegistry.unregisterSource(sourceId);
    };
  }, [sourceId, pdfId, mainDbName]);

  return sourceId;
}

export const buildPdfSystemPrompt = (pdf: Pdf): string =>
  `你是 PDF 阅读助手，只能基于当前 PDF 回答问题。

## 可用工具
- search_pdf_knowledge：搜索当前 PDF 的相关片段，返回页码、chunk 和字符范围
- get_pdf_document_info：读取当前 PDF 的总页数和索引状态
- get_pdf_outline：读取当前 PDF 的目录
- read_pdf_page_range：读取指定页范围全文
- get_pdf_annotations：读取当前 PDF 的标注、区域截图与笔记
- get_pdf_bookmarks：读取当前 PDF 的书签

## 工作流要求
1. 先理解问题
2. 如果是结构性问题（例如“整体结构是什么”“有哪些章节”），优先调用 get_pdf_outline 或 get_pdf_document_info
3. 如果是内容问题，优先调用 search_pdf_knowledge 获取证据片段和字符范围
4. 根据搜索结果的页码或字符范围，再用 read_pdf_page_range 读取完整上下文
5. 如果需要按目录浏览，再调用 get_pdf_outline
6. 需要用户上下文时，再调用 get_pdf_annotations / get_pdf_bookmarks
7. 证据不足时明确说明，不要猜测
8. 用户消息开头以 \`>\` 引用的是用户在 PDF 里选中的原文（附页码），问题针对这段原文

## 回答要求
- 回答尽量给出对应页码
- 只使用当前 PDF 的信息，不混入其它知识库
- 如果当前 PDF 尚未完成索引，应说明限制并尽量基于已读页面作答
- 回答整体问题时，先用目录或搜索结果定位，再读取相关页范围后归纳，不要凭摘要臆测
- 当你引用证据时，只能使用这种行内 PDF 引用语法，不要使用 Markdown 链接，不要使用 blockquote（\`>\`）：
  \`:pdfref[第12页｜这里放 40-80 字的证据摘要]{page=12 charStart=120 charEnd=180}\`
- PDF 引用必须作为行内脚注附着在相关句子末尾，不要单独成段
- \`page\` 必填，\`charStart/charEnd\` 选填；优先直接复用工具返回的 \`citation\` 字段，不要自己编造页码
- \`label\`（即 \`:pdfref[这里]\` 里的内容）禁止出现半角 \`[\` \`]\` \`{\` \`}\`；如果证据原文包含这些字符，必须改写或替换为全角符号（如 \`（\` \`）\`），否则语法会失效
- 如果工具已经返回了 \`citation\` 字段，优先直接原样输出该字段，不要手写或重组 PDF 引用语法
- 证据摘要尽量简短稳定，避免包含复杂公式、数组下标、代码片段或任何可能引入 \`[]{}\` 的原文片段

## 当前文档
- 文件名：${pdf.fileName}`;
