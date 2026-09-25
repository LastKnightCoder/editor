import type { MCPProviderDefinition } from "./types";
import { buildCalendarEventTools } from "./calendar-tools/event-tools";
import { buildCalendarGroupTools } from "./calendar-tools/group-tools";
import { buildCalendarTools } from "./calendar-tools/calendar-tools";

export const calendarEventToolsProvider: MCPProviderDefinition = {
  id: "calendar-event-tools",
  name: "日历工具",
  description: "提供日历分组、日历和日历事件的增删改操作。查询请使用 sql_query。",
  defaultEnabled: true,
  tools: () => [
    ...buildCalendarGroupTools(),
    ...buildCalendarTools(),
    ...buildCalendarEventTools(),
  ],
};
