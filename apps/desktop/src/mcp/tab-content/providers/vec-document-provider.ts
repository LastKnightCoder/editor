import { TabType } from "@/types/tab";
import { getAllVecDocumentResults } from "@/commands/vec-document";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class VecDocumentProvider extends BaseTabContentProvider<TabType.VecDocument> {
  readonly tabType = TabType.VecDocument;

  async getContent(
    tab: ITab<TabType.VecDocument>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const allResults = await getAllVecDocumentResults();

    const content = {
      description: "向量索引数据库 - 用于语义搜索和内容检索",
      statistics: {
        totalIndexed: allResults.length,
        byType: allResults.reduce(
          (acc, r) => {
            acc[r.type] = (acc[r.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      recentResults: allResults.slice(0, 20).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        updateTime: r.updateTime,
      })),
      type: "functional-page",
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
