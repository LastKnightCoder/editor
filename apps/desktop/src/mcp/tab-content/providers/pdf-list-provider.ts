import { TabType } from "@/types/tab";
import { getPdfList } from "@/commands/pdf";
import { getEpubList } from "@/commands/epub";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class PdfListProvider extends BaseTabContentProvider<TabType.PdfList> {
  readonly tabType = TabType.PdfList;

  async getContent(
    tab: ITab<TabType.PdfList>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    // 获取 PDF 和 EPUB 列表
    const [pdfs, epubs] = await Promise.all([getPdfList(), getEpubList()]);

    // 合并 PDF 和 EPUB
    const allBooks = [
      ...pdfs.map((p) => ({
        type: "pdf" as const,
        id: p.id,
        fileName: p.fileName,
        filePath: p.filePath,
        category: p.category,
        tags: p.tags,
        createTime: p.createTime,
      })),
      ...epubs.map((e) => ({
        type: "epub" as const,
        id: e.id,
        fileName: e.fileName,
        filePath: e.filePath,
        category: e.category,
        tags: e.tags,
        createTime: e.createTime,
        progress: e.progressPercentage,
      })),
    ];

    // 按创建时间排序
    allBooks.sort((a, b) => b.createTime - a.createTime);

    // 限制返回数量（支持范围）
    const {
      items: books,
      truncated,
      originalCount,
      totalCount,
      range,
    } = this.limitItems(allBooks, options?.itemRange);

    return {
      metadata,
      content: books,
      contentType: "list",
      truncated,
      itemCount: originalCount,
      totalLength: totalCount,
      range,
    };
  }
}
