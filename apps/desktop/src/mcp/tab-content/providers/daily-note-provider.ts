import { TabType } from "@/types/tab";
import { getDiaryEntryByDate } from "@/commands/diary";
import { getMarkdown } from "@/utils/markdown-helper";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class DailyNoteProvider extends BaseTabContentProvider<TabType.DailyNote> {
  readonly tabType = TabType.DailyNote;

  async getContent(
    tab: ITab<TabType.DailyNote>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const today = new Date().toISOString().split("T")[0];
    const todayEntry = await getDiaryEntryByDate(today);

    if (todayEntry) {
      const markdown = getMarkdown(todayEntry.content);

      const { content, truncated, originalLength, totalLength, range } =
        this.truncateContent(markdown, options?.range);

      return {
        metadata,
        content: {
          date: todayEntry.date,
          type: todayEntry.type,
          markdown: content,
          weather: todayEntry.weather,
          mood: todayEntry.mood,
        },
        contentType: "markdown",
        truncated,
        originalLength,
        totalLength,
        range,
      };
    } else {
      return {
        metadata,
        content: {
          date: today,
          message: "今日尚无日记",
          type: "empty",
        },
        contentType: "object",
        truncated: false,
        originalLength: 0,
        totalLength: 0,
      };
    }
  }
}
