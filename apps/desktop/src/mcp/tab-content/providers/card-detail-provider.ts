import { TabType } from "@/types/tab";
import { getCardById } from "@/commands/card";
import { getMarkdown } from "@/utils/markdown-helper";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class CardDetailProvider extends BaseTabContentProvider<TabType.CardDetail> {
  readonly tabType = TabType.CardDetail;

  validateParams(params?: { id: number }): boolean {
    return !!(params?.id && typeof params.id === "number");
  }

  async getContent(
    tab: ITab<TabType.CardDetail>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.id) {
      throw new Error("Card ID is required");
    }

    // 获取卡片详情
    const card = await getCardById(tab.params.id);

    // 转换为 Markdown
    const markdown = getMarkdown(card.content);

    // 截断处理（支持范围）
    const { content, truncated, originalLength, totalLength, range } =
      this.truncateContent(markdown, options?.range);

    // 构建完整响应
    const fullContent = {
      markdown: content,
      metadata: {
        id: card.id,
        category: card.category,
        tags: card.tags,
        wordCount: card.count,
        createTime: card.create_time,
        updateTime: card.update_time,
        isTop: card.isTop,
        links: card.links,
        contentId: card.contentId,
      },
    };

    return {
      metadata,
      content: options?.includeMetadata !== false ? fullContent : content,
      contentType: "markdown",
      truncated,
      originalLength,
      totalLength,
      range,
    };
  }
}
