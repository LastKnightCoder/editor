import { TabType } from "@/types/tab";
import { getPdfList } from "@/commands/pdf";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class PdfListProvider extends BaseTabContentProvider<TabType.PdfList> {
  readonly tabType = TabType.PdfList;

  async getContent(
    tab: ITab<TabType.PdfList>,
    options?: TabContentOptions
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const pdfs = await getPdfList();

    const allBooks = pdfs.map(p => ({
      type: "pdf" as const,
      id: p.id,
      fileName: p.fileName,
      filePath: p.filePath,
      category: p.category,
      tags: p.tags,
      createTime: p.createTime,
    }));

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
