import { TabType } from "@/types/tab";
import { getAllCalendars, getEventsByDateRange } from "@/commands/calendar";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class CalendarProvider extends BaseTabContentProvider<TabType.Calendar> {
  readonly tabType = TabType.Calendar;

  async getContent(
    tab: ITab<TabType.Calendar>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const calendars = await getAllCalendars();
    const now = Date.now();
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const events = await getEventsByDateRange(oneMonthAgo, now);

    const content = {
      calendars: calendars.map((c) => ({
        id: c.id,
        name: c.title,
        color: c.color,
        visible: c.visible,
      })),
      statistics: {
        totalCalendars: calendars.length,
        totalEvents: events.length,
        upcomingEvents: events.filter(
          (e) => e.startTime !== null && e.startTime > now,
        ).length,
      },
      recentEvents: events.slice(0, 10).map((e) => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime ?? e.startDate,
        endTime: e.endTime ?? e.endDate,
        calendarId: e.calendarId,
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
