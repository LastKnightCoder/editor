import { describe, expect, it } from "vitest";
import { shouldRefreshCalendarResult } from "../mutation";
import type { CalendarMutationEvent } from "@/types";

const buildEvent = (
  overrides: Partial<CalendarMutationEvent> = {},
): CalendarMutationEvent => ({
  source: "calendar-mcp",
  entityType: "calendar-event",
  entityId: 1,
  calendarId: 20,
  previousCalendarId: 10,
  groupId: 200,
  previousGroupId: 100,
  action: "update-event",
  timestamp: Date.now(),
  ...overrides,
});

describe("calendar mutation refresh rules", () => {
  it("事件跨日历移动时应刷新旧日历详情", () => {
    expect(
      shouldRefreshCalendarResult({
        event: buildEvent(),
        toolName: "get_calendar_detail",
        payloadKind: "calendar-detail",
        payloadEntityType: "calendar",
        payloadId: 10,
      }),
    ).toBe(true);
  });

  it("日历跨分组移动时应刷新旧分组详情", () => {
    expect(
      shouldRefreshCalendarResult({
        event: buildEvent({
          entityType: "calendar",
          entityId: 30,
          groupId: 200,
          previousGroupId: 100,
          calendarId: 30,
          previousCalendarId: null,
          action: "update-calendar",
        }),
        toolName: "get_calendar_group_detail",
        payloadKind: "calendar-group-detail",
        payloadEntityType: "calendar-group",
        payloadId: 100,
      }),
    ).toBe(true);
  });
});
