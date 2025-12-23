import type { ToolParameterSchema } from "@/types";
import { getEventsWithContent } from "@/commands/calendar";
import type { MCPProviderDefinition } from "./types";

export const calendarEventToolsProvider: MCPProviderDefinition = {
  id: "calendar-event-tools",
  name: "日历事件工具",
  description: "提供日历事件的查询工具",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_events_by_dates",
      description:
        "根据日期数组获取日历事件。返回事件的元数据（标题、时间、日历ID）和详细内容（Markdown 格式）。",
      parameters: {
        type: "object",
        properties: {
          dates: {
            type: "array",
            items: { type: "string" },
            description: "日期数组，格式 YYYY-MM-DD",
          },
          calendarIds: {
            type: "array",
            items: { type: "number" },
            description: "可选，日历 ID 数组，用于筛选特定日历的事件",
          },
          maxLength: {
            type: "number",
            description: "可选，详细内容最大长度限制",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["dates"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const result = await getEventsWithContent({
          dates: args.dates as string[],
          calendarIds: args.calendarIds as number[] | undefined,
          maxLength: args.maxLength as number | undefined,
        });
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "get_events_by_date_range",
      description:
        "根据日期范围获取日历事件。返回事件的元数据和详细内容（Markdown 格式）。",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "起始日期，格式 YYYY-MM-DD",
          },
          endDate: {
            type: "string",
            description: "结束日期，格式 YYYY-MM-DD",
          },
          calendarIds: {
            type: "array",
            items: { type: "number" },
            description: "可选，日历 ID 数组",
          },
          maxLength: {
            type: "number",
            description: "可选，详细内容最大长度限制",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["startDate", "endDate"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const result = await getEventsWithContent({
          startDate: args.startDate as string,
          endDate: args.endDate as string,
          calendarIds: args.calendarIds as number[] | undefined,
          maxLength: args.maxLength as number | undefined,
        });
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
  ],
};
