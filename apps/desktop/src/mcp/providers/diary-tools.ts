import type { ToolParameterSchema } from "@/types";
import { getDiariesWithContent } from "@/commands/diary";
import type { MCPProviderDefinition } from "./types";

export const diaryToolsProvider: MCPProviderDefinition = {
  id: "diary-tools",
  name: "日记工具",
  description: "提供日记、周记、月记的查询工具",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_diaries_by_dates",
      description:
        "根据日期数组获取日记内容。返回包含日记元数据（类型、天气、心情、字数）和 Markdown 格式内容。",
      parameters: {
        type: "object",
        properties: {
          dates: {
            type: "array",
            items: { type: "string" },
            description:
              "日期数组，格式 YYYY-MM-DD（日记）、YYYY-Www（周记，如2025-W01）、YYYY-MM（月记，如2025-01）",
          },
          diaryType: {
            type: "string",
            enum: ["daily", "weekly", "monthly"],
            description:
              "可选，日记类型。daily=日记，weekly=周记，monthly=月记",
          },
          maxLength: {
            type: "number",
            description: "可选，内容最大长度限制（字符数）",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["dates"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const result = await getDiariesWithContent({
          dates: args.dates as string[],
          diaryType: args.diaryType as
            | "daily"
            | "weekly"
            | "monthly"
            | undefined,
          maxLength: args.maxLength as number | undefined,
        });
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "get_diaries_by_date_range",
      description:
        "根据日期范围获取日记内容。返回包含日记元数据和 Markdown 格式内容。",
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
          diaryType: {
            type: "string",
            enum: ["daily", "weekly", "monthly"],
            description: "可选，日记类型",
          },
          maxLength: {
            type: "number",
            description: "可选，内容最大长度限制",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["startDate", "endDate"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const result = await getDiariesWithContent({
          startDate: args.startDate as string,
          endDate: args.endDate as string,
          diaryType: args.diaryType as
            | "daily"
            | "weekly"
            | "monthly"
            | undefined,
          maxLength: args.maxLength as number | undefined,
        });
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
  ],
};
