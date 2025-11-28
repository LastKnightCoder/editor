import dayjs from "dayjs";
import type { ToolDefinition, ToolParameterSchema } from "@/types";
import {
  getCardsByDates,
  getCardsByDateRange,
  getCardsContentByIds,
  getArticlesByDates,
  getArticlesByDateRange,
  getArticlesContentByIds,
  getProjectItemsByDates,
  getProjectItemsByDateRange,
  getProjectItemsContentByIds,
} from "@/commands";
import { analyzeOperations } from "@/commands/operation";
import { getDiariesWithContent } from "@/commands/diary";
import { getEventsWithContent } from "@/commands/calendar";
import { getMarkdown } from "@/utils/markdown-helper";

export interface MCPProviderDefinition {
  id: string;
  name: string;
  description: string;
  defaultEnabled?: boolean;
  tools: () => ToolDefinition[];
}

export const MCP_PROVIDERS: MCPProviderDefinition[] = [
  {
    id: "card-tools",
    name: "卡片工具",
    description: "提供卡片查询、操作记录分析和内容获取工具",
    defaultEnabled: true,
    tools: () => [
      {
        name: "get_cards_by_dates",
        description:
          "根据日期数组批量获取卡片统计数据。返回按日期分组的卡片列表，包括卡片的标题、标签、分类、字数等信息。",
        parameters: {
          type: "object",
          properties: {
            dates: {
              type: "array",
              items: { type: "string" },
              description:
                "日期数组，格式 YYYY-MM-DD。例如：['2025-01-01', '2025-01-02']。",
            },
          } as Record<string, ToolParameterSchema>,
          required: ["dates"],
          additionalProperties: false,
        },
        executor: async (args) => {
          const dates = args.dates as string[];
          const result = await getCardsByDates(dates);

          // 将每个卡片的 content 转换为 Markdown
          const converted = Object.fromEntries(
            Object.entries(result).map(([date, cards]) => [
              date,
              cards.map((card) => ({
                ...card,
                content: card.content ? getMarkdown(card.content) : "",
              })),
            ]),
          );

          return {
            content: JSON.stringify(converted, null, 2),
          };
        },
      },
      {
        name: "get_cards_by_date_range",
        description:
          "根据日期范围获取卡片统计数据。返回按日期分组的卡片列表，适用于获取连续时间段的数据。",
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

          const result = await getCardsByDateRange(startDate, endDate);

          // 将每个卡片的 content 转换为 Markdown
          const converted = Object.fromEntries(
            Object.entries(result).map(([date, cards]) => [
              date,
              cards.map((card) => ({
                ...card,
                content: card.content ? getMarkdown(card.content) : "",
              })),
            ]),
          );

          return {
            content: JSON.stringify(converted, null, 2),
          };
        },
      },
      {
        name: "get_card_operations",
        description:
          "获取卡片的详细操作记录，包括创建、编辑时间段、删除等信息。编辑时间段会自动合并间隔小于3分钟的连续编辑操作，返回每个编辑会话的起止时间（格式：YYYY-MM-DD HH:mm:ss）和持续时长（秒）。",
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
            contentType: "card",
          });
          return {
            content: JSON.stringify(result, null, 2),
          };
        },
      },
      {
        name: "get_cards_content",
        description:
          "根据卡片 IDs 获取卡片内容（转换为 Markdown 格式）。支持设置最大长度限制以避免返回过长内容。返回的内容包括 Markdown 文本、是否被截断、原始长度以及元数据（标签、分类、时间、字数等）。",
        parameters: {
          type: "object",
          properties: {
            ids: {
              type: "array",
              items: { type: "number" },
              description: "卡片 ID 数组。例如：[1, 2, 3]",
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
            return "错误：一次最多获取20张卡片的内容";
          }

          const result = await getCardsContentByIds(ids, maxLength);
          return {
            content: JSON.stringify(result, null, 2),
          };
        },
      },
    ],
  },
  {
    id: "article-tools",
    name: "文章工具",
    description: "提供文章查询、操作记录分析和内容获取工具",
    defaultEnabled: true,
    tools: () => [
      {
        name: "get_articles_by_dates",
        description:
          "根据日期数组批量获取文章数据。返回按日期分组的文章列表，包括文章的标题、作者、标签、字数等信息。",
        parameters: {
          type: "object",
          properties: {
            dates: {
              type: "array",
              items: { type: "string" },
              description: "日期数组，格式 YYYY-MM-DD。最多支持31个日期。",
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
          const result = await getArticlesByDates(dates);

          // 将每篇文章的 content 转换为 Markdown
          const converted = Object.fromEntries(
            Object.entries(result).map(([date, articles]) => [
              date,
              articles.map((article) => ({
                ...article,
                content: article.content ? getMarkdown(article.content) : "",
              })),
            ]),
          );

          return {
            content: JSON.stringify(converted, null, 2),
          };
        },
      },
      {
        name: "get_articles_by_date_range",
        description:
          "根据日期范围获取文章数据。返回按日期分组的文章列表，适用于获取连续时间段的数据。",
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
          } as Record<string, ToolParameterSchema>,
          required: ["startDate", "endDate"],
          additionalProperties: false,
        },
        executor: async (args) => {
          const startDate = args.startDate as string;
          const endDate = args.endDate as string;
          const start = dayjs(startDate);
          const end = dayjs(endDate);
          if (end.diff(start, "day") > 365) {
            return "错误：日期范围最多支持1年";
          }
          const result = await getArticlesByDateRange(startDate, endDate);

          // 将每篇文章的 content 转换为 Markdown
          const converted = Object.fromEntries(
            Object.entries(result).map(([date, articles]) => [
              date,
              articles.map((article) => ({
                ...article,
                content: article.content ? getMarkdown(article.content) : "",
              })),
            ]),
          );

          return {
            content: JSON.stringify(converted, null, 2),
          };
        },
      },
      {
        name: "get_article_operations",
        description:
          "获取文章的详细操作记录，包括创建、编辑时间段、删除等信息。",
        parameters: {
          type: "object",
          properties: {
            dates: {
              type: "array",
              items: { type: "string" },
              description: "可选，日期数组，格式 YYYY-MM-DD",
            },
            startDate: {
              type: "string",
              description: "可选，起始日期",
            },
            endDate: {
              type: "string",
              description: "可选，结束日期",
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
            contentType: "article",
          });
          return {
            content: JSON.stringify(result, null, 2),
          };
        },
      },
      {
        name: "get_articles_content",
        description:
          "根据文章 IDs 获取文章内容（转换为 Markdown 格式）。返回的内容包括 Markdown 文本、元数据（标题、作者、标签等）。",
        parameters: {
          type: "object",
          properties: {
            ids: {
              type: "array",
              items: { type: "number" },
              description: "文章 ID 数组",
            },
            maxLength: {
              type: "number",
              description: "可选，最大长度限制（字符数）",
            },
          } as Record<string, ToolParameterSchema>,
          required: ["ids"],
          additionalProperties: false,
        },
        executor: async (args) => {
          const ids = args.ids as number[];
          const maxLength = args.maxLength as number | undefined;
          if (ids.length > 20) {
            return "错误：一次最多获取20篇文章的内容";
          }
          const result = await getArticlesContentByIds(ids, maxLength);
          return {
            content: JSON.stringify(result, null, 2),
          };
        },
      },
    ],
  },
  {
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
  },
  {
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
  },
  {
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
  },
];
