import { readContentForExport } from "@/services/content-transfer";
import type { Descendant } from "slate";
import { exportPdfWithDialog } from "@/commands";
import type { PdfExportPayload, PdfExportResult } from "@/types";
import { sanitizeFileName } from "@/utils/file-name";
import { buildPdfHtml, processCodeBlocks } from "@/utils/pdf-html-builder";

export interface ExportSlateToPdfInput {
  content: Descendant[];
  contentId?: number;
  metadata: {
    title: string;
    author?: string;
    description?: string;
    coverImageSrc?: string;
  };
  defaultFileName?: string;
}

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

export const exportSlateToPdfWithDialog = async (
  input: ExportSlateToPdfInput
): Promise<PdfExportResult> => {
  const document = await readContentForExport(input.content || [], input.contentId);
  const { html: bodyHtml, styles } = await buildPdfHtml({
    content: document.content,
    title: input.metadata.title,
    author: input.metadata.author,
    chapterBreak: true,
  });

  const processedHtml = processCodeBlocks(bodyHtml, "adaptive");
  const finalHtml = buildPdfHtmlWithCover(processedHtml, input.metadata.coverImageSrc);

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
    defaultFileName: sanitizeFileName(input.defaultFileName || input.metadata.title, "未命名文档"),
  };

  return await exportPdfWithDialog(payload);
};
