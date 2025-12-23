import { TabType } from "@/types/tab";
import { listFlashcardDecks } from "@/commands/flashcard";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class FlashcardCenterProvider extends BaseTabContentProvider<TabType.FlashcardCenter> {
  readonly tabType = TabType.FlashcardCenter;

  async getContent(
    tab: ITab<TabType.FlashcardCenter>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const decks = await listFlashcardDecks();

    const content = {
      decks: decks.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        cardCount: d.stats?.totalCards ?? 0,
        reviewCount: d.stats?.dueCount ?? 0,
        createTime: d.createTime,
      })),
      summary: {
        totalDecks: decks.length,
        totalCards: decks.reduce(
          (sum, d) => sum + (d.stats?.totalCards ?? 0),
          0,
        ),
        totalReviews: decks.reduce(
          (sum, d) => sum + (d.stats?.dueCount ?? 0),
          0,
        ),
      },
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
