import dayjs from "dayjs";
import type { ToolParameterSchema } from "@/types";
import {
  getArticlesByDates,
  getArticlesByDateRange,
  getArticlesContentByIds,
} from "@/commands";
import { analyzeOperations } from "@/commands/operation";
import { getMarkdown } from "@/utils/markdown-helper";
import type { MCPProviderDefinition } from "./types";

export const articleToolsProvider: MCPProviderDefinition = {
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
      description: "获取文章的详细操作记录，包括创建、编辑时间段、删除等信息。",
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
};
