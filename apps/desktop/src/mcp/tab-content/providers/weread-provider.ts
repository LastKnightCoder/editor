import { TabType } from "@/types/tab";
import {
  getAllWeReadNotebooks,
  getWeReadLastSyncTime,
} from "@/commands/weread";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class WeReadProvider extends BaseTabContentProvider<TabType.WeRead> {
  readonly tabType = TabType.WeRead;

  async getContent(
    tab: ITab<TabType.WeRead>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const [notebooks, lastSyncTime] = await Promise.all([
      getAllWeReadNotebooks(),
      getWeReadLastSyncTime(),
    ]);

    const content = {
      notebooks: notebooks.map((n) => ({
        bookId: n.metaData.bookId,
        title: n.metaData.title,
        author: n.metaData.author,
        cover: n.metaData.cover,
        noteCount: n.metaData.noteCount,
        reviewCount: n.metaData.reviewCount,
        lastReadDate: n.metaData.lastReadDate,
      })),
      statistics: {
        totalBooks: notebooks.length,
        totalNotes: notebooks.reduce((sum, n) => sum + n.metaData.noteCount, 0),
        lastSyncTime: lastSyncTime,
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
