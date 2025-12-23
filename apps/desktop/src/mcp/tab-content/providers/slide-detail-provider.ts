import { TabType } from "@/types/tab";
import {
  getSlideDeckById,
  getSlidePagesByDeck,
  getSlideAssetsByDeck,
} from "@/commands/slide";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class SlideDetailProvider extends BaseTabContentProvider<TabType.SlideDetail> {
  readonly tabType = TabType.SlideDetail;

  validateParams(params?: { id: number }): boolean {
    return !!(params?.id && typeof params.id === "number");
  }

  async getContent(
    tab: ITab<TabType.SlideDetail>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.id) {
      throw new Error("Slide ID is required");
    }

    // 获取幻灯片组详情、页面列表和资源
    const [deck, pages, assets] = await Promise.all([
      getSlideDeckById(tab.params.id),
      getSlidePagesByDeck(tab.params.id),
      getSlideAssetsByDeck(tab.params.id),
    ]);

    const content = {
      deck: {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        tags: deck.tags,
        createTime: deck.createTime,
        updateTime: deck.updateTime,
      },
      pages: pages.map((p) => ({
        id: p.id,
        pageIndex: p.pageIndex,
        content: p.content,
        speakerNotes: p.speakerNotes,
      })),
      assets: assets.map((a) => ({
        id: a.id,
        assetType: a.assetType,
        assetUrl: a.assetUrl,
        localPath: a.localPath,
      })),
      statistics: {
        pageCount: pages.length,
        assetCount: assets.length,
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
