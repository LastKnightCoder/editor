import { TabType } from "@/types/tab";
import { getAllCards } from "@/commands/card";
import { getMarkdown } from "@/utils/markdown";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class CardListProvider extends BaseTabContentProvider<TabType.CardList> {
  readonly tabType = TabType.CardList;

  async getContent(
    tab: ITab<TabType.CardList>,
    options?: TabContentOptions
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    // 获取所有卡片
    const allCards = await getAllCards();

    // 限制返回数量（支持范围）
    const {
      items: cards,
      truncated,
      originalCount,
      totalCount,
      range,
    } = this.limitItems(allCards, options?.itemRange);

    // 转换为简化格式（不包含完整内容）
    const cardList = cards.map(card => ({
      id: card.id,
      title: getMarkdown(card.content).split("\n")[0] || "无标题", // 第一行作为标题
      category: card.category,
      tags: card.tags,
      wordCount: card.count,
      createTime: card.create_time,
      updateTime: card.update_time,
      isTop: card.isTop,
    }));

    return {
      metadata,
      content: cardList,
      contentType: "list",
      truncated,
      itemCount: originalCount,
      totalLength: totalCount,
      range,
    };
  }
}
