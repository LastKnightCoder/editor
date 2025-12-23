import { TabType } from "@/types/tab";
import { getPdfById, getPdfAnnotations, getPdfBookmarks } from "@/commands/pdf";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class PdfDetailProvider extends BaseTabContentProvider<TabType.PdfDetail> {
  readonly tabType = TabType.PdfDetail;

  validateParams(params?: { id: number }): boolean {
    return !!(params?.id && typeof params.id === "number");
  }

  async getContent(
    tab: ITab<TabType.PdfDetail>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.id) {
      throw new Error("PDF ID is required");
    }

    // 获取 PDF 详情、标注和书签
    const [pdf, annotations, bookmarks] = await Promise.all([
      getPdfById(tab.params.id),
      getPdfAnnotations(tab.params.id),
      getPdfBookmarks(tab.params.id),
    ]);

    const content = {
      pdf: {
        id: pdf.id,
        fileName: pdf.fileName,
        filePath: pdf.filePath,
        isLocal: pdf.isLocal,
        remoteUrl: pdf.remoteUrl,
        category: pdf.category,
        tags: pdf.tags,
        createTime: pdf.createTime,
      },
      annotations: annotations.map((a) => ({
        id: a.id,
        pdfId: a.pdfId,
        type: a.type,
        color: a.color,
        notesCount: a.notes.length,
        createTime: a.createTime,
      })),
      bookmarks: bookmarks.map((b) => ({
        id: b.id,
        pdfId: b.pdfId,
        createTime: b.createTime,
      })),
      statistics: {
        annotationCount: annotations.length,
        bookmarkCount: bookmarks.length,
      },
    };

    return {
      metadata,
      content,
      contentType: "object",
      truncated: false,
      originalLength: 0,
      totalLength: 0,
    };
  }
}
