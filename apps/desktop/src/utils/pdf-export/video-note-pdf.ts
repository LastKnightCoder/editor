import type { Descendant } from "slate";
import { exportPdfWithDialog } from "@/commands";
import type { PdfExportPayload, PdfExportResult } from "@/types";
import { buildPdfHtml, processCodeBlocks } from "@/utils/pdf-html-builder";

export interface ExportVideoNoteToPdfInput {
  content: Descendant[];
  metadata: {
    title: string;
    author?: string;
    description?: string;
    coverImageSrc?: string;
  };
  defaultFileName?: string;
}

const sanitizeFileName = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "未命名文档";
  }
  const sanitized = trimmed
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "未命名文档";
};

/**
 * 构建带封面的 PDF HTML
 */
const buildPdfHtmlWithCover = (html: string, coverImageSrc?: string) => {
  if (!coverImageSrc) return html;

  const coverPage = `
    <div style="
      page-break-after: always;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    ">
      <img src="${coverImageSrc}" alt="封面" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
    </div>
  `;

  return coverPage + html;
};

export const exportVideoNoteToPdfWithDialog = async (
  input: ExportVideoNoteToPdfInput,
): Promise<PdfExportResult> => {
  // 1. 构建 HTML 和样式
  const { html: bodyHtml, styles } = await buildPdfHtml({
    content: input.content || [],
    title: input.metadata.title,
    author: input.metadata.author,
    chapterBreak: true,
  });

  // 2. 处理代码块分页
  const processedHtml = processCodeBlocks(bodyHtml, "adaptive");

  // 3. 添加封面（如果有）
  const finalHtml = buildPdfHtmlWithCover(
    processedHtml,
    input.metadata.coverImageSrc,
  );

  // 4. 构建 PDF 导出 payload
  const payload: PdfExportPayload = {
    html: finalHtml,
    styles,
    metadata: {
      title: input.metadata.title,
      author: input.metadata.author,
      subject: input.metadata.description,
    },
    options: {
      pageSize: "A4",
      landscape: false,
      margins: {
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
      },
      printBackground: true,
      displayHeaderFooter: false,
      chapterBreak: true,
      codeBlockBreak: {
        strategy: "adaptive",
      },
    },
    defaultFileName: sanitizeFileName(
      input.defaultFileName || input.metadata.title || "未命名文档",
    ),
  };

  // 5. 调用导出对话框
  return await exportPdfWithDialog(payload);
};
