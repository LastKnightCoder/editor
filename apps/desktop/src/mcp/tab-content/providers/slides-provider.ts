import { TabType } from "@/types/tab";
import { getSlideDecks } from "@/commands/slide";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class SlidesProvider extends BaseTabContentProvider<TabType.Slides> {
  readonly tabType = TabType.Slides;

  async getContent(
    tab: ITab<TabType.Slides>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    // 获取所有幻灯片
    const allSlides = await getSlideDecks();

    // 限制返回数量（支持范围）
    const {
      items: slides,
      truncated,
      originalCount,
      totalCount,
      range,
    } = this.limitItems(allSlides, options?.itemRange);

    // 转换为简化格式（不包含完整内容）
    const slideList = slides.map((slide) => ({
      id: slide.id,
      title: slide.title,
      description: slide.description,
      tags: slide.tags,
      createTime: slide.createTime,
      updateTime: slide.updateTime,
    }));

    return {
      metadata,
      content: slideList,
      contentType: "list",
      truncated,
      itemCount: originalCount,
      totalLength: totalCount,
      range,
    };
  }
}
