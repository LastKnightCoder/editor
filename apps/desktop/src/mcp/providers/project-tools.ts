import dayjs from "dayjs";
import type { ToolParameterSchema } from "@/types";
import {
  getProjectItemsByDates,
  getProjectItemsByDateRange,
  getProjectItemsContentByIds,
} from "@/commands";
import { analyzeOperations } from "@/commands/operation";
import { getMarkdown } from "@/utils/markdown-helper";
import type { MCPProviderDefinition } from "./types";

export const projectToolsProvider: MCPProviderDefinition = {
  id: "project-tools",
  name: "项目文档工具",
  description: "提供项目文档查询、操作记录分析和内容获取工具",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_project_items_by_dates",
      description:
        "根据日期数组批量获取项目文档数据。返回按日期分组的文档列表，包括文档的标题、类型、关联项目等信息。",
      parameters: {
        type: "object",
        properties: {
          dates: {
            type: "array",
            items: { type: "string" },
            description:
              "日期数组，格式 YYYY-MM-DD。例如：['2025-01-01', '2025-01-02']。最多支持31个日期。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["dates"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const dates = args.dates as string[];
        if (dates.length > 31) {
          return "错误：日期数组最多支持31个日期";
        }
        const result = await getProjectItemsByDates(dates);

        // 将每个项目文档的 content 转换为 Markdown
        const converted = Object.fromEntries(
          Object.entries(result).map(([date, items]) => [
            date,
            items.map((item) => ({
              ...item,
              content: item.content ? getMarkdown(item.content) : "",
            })),
          ]),
        );

        return {
          content: JSON.stringify(converted, null, 2),
        };
      },
    },
    {
      name: "get_project_items_by_date_range",
      description:
        "根据日期范围获取项目文档数据。返回按日期分组的文档列表，适用于获取连续时间段的数据。",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "起始日期，格式 YYYY-MM-DD。例如：2025-01-01",
          },
          endDate: {
            type: "string",
            description: "结束日期，格式 YYYY-MM-DD。例如：2025-01-31",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["startDate", "endDate"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const startDate = args.startDate as string;
        const endDate = args.endDate as string;

        // 验证日期范围不超过1年
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        if (end.diff(start, "day") > 365) {
          return "错误：日期范围最多支持1年";
        }

        const result = await getProjectItemsByDateRange(startDate, endDate);

        // 将每个项目文档的 content 转换为 Markdown
        const converted = Object.fromEntries(
          Object.entries(result).map(([date, items]) => [
            date,
            items.map((item) => ({
              ...item,
              content: item.content ? getMarkdown(item.content) : "",
            })),
          ]),
        );

        return {
          content: JSON.stringify(converted, null, 2),
        };
      },
    },
    {
      name: "get_project_item_operations",
      description:
        "获取项目文档的详细操作记录，包括创建、编辑时间段、删除等信息。编辑时间段会自动合并间隔小于3分钟的连续编辑操作。",
      parameters: {
        type: "object",
        properties: {
          dates: {
            type: "array",
            items: { type: "string" },
            description:
              "可选，日期数组，格式 YYYY-MM-DD。与 startDate/endDate 二选一。",
          },
          startDate: {
            type: "string",
            description:
              "可选，起始日期，格式 YYYY-MM-DD。需与 endDate 一起使用。",
          },
          endDate: {
            type: "string",
            description:
              "可选，结束日期，格式 YYYY-MM-DD。需与 startDate 一起使用。",
          },
        } as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async (args) => {
        const result = await analyzeOperations({
          dates: args.dates as string[] | undefined,
          startDate: args.startDate as string | undefined,
          endDate: args.endDate as string | undefined,
          contentType: "project-item",
        });
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "get_project_items_content",
      description:
        "根据项目文档 IDs 获取文档内容（转换为 Markdown 格式）。支持设置最大长度限制以避免返回过长内容。返回的内容包括 Markdown 文本、是否被截断、原始长度以及元数据（标题、关联项目、时间、字数等）。",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "number" },
            description: "项目文档 ID 数组。例如：[1, 2, 3]",
          },
          maxLength: {
            type: "number",
            description:
              "可选，最大长度限制（字符数）。默认无限制。建议设置为 5000 以避免内容过长。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["ids"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const ids = args.ids as number[];
        const maxLength = args.maxLength as number | undefined;

        if (ids.length > 20) {
          return "错误：一次最多获取20个文档的内容";
        }

        const result = await getProjectItemsContentByIds(ids, maxLength);
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
  ],
};
