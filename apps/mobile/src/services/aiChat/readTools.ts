// 只读宿主工具：工具名、入参与桌面同名同义；移动端能力不同处在描述里写明。

import type { Descendant } from "slate";
import * as tauri from "../tauri";
import { mobileMarkdown } from "../editorMarkdown";
import { failure, integer, objectSchema, ok, text, type HostTool } from "./tool";

const SEARCH_TYPES = [
  "card",
  "article",
  "project-item",
  "diary-daily",
  "flashcard",
  "plugin-entity",
];

const pad = (value: number) => String(value).padStart(2, "0");
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export const getCurrentDateTool: HostTool = {
  name: "get_current_date",
  risk: "read",
  description: "返回今天的日期信息，包括 ISO 格式、简短日期以及星期几。",
  inputSchema: objectSchema({}),
  execute: async () => {
    const now = new Date();
    return ok({
      iso: now.toISOString(),
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      weekday: WEEKDAYS[now.getDay()],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  },
};

export const searchKnowledgeTool: HostTool = {
  name: "search_knowledge",
  risk: "read",
  description:
    "搜索用户的个人知识库内容，包括卡片、文章、项目条目、日记、闪卡与插件里写的内容。" +
    "当用户的问题可能涉及其已有的笔记、资料或知识时，使用此工具进行检索。" +
    "手机端为关键词全文检索（不做语义检索），query 用笔记里可能出现的关键词，必要时换同义词再搜一次。" +
    "返回匹配的内容列表（标题、摘要、类型、ID、contentId），需要整篇时用 get_content_markdown 读取。" +
    "引用结果时使用 :ref[文字]{id=ID type=类型}。",
  inputSchema: objectSchema(
    {
      query: {
        type: "string",
        description:
          "纯检索关键词，只包含要查找的主题内容，不要包含「请帮我搜索」「我的笔记」等对话指令。",
      },
      types: {
        type: "array",
        items: { type: "string", enum: SEARCH_TYPES },
        description:
          "可选，限定类型：card（卡片）、article（文章）、project-item（项目条目）、diary-daily（日记）、flashcard（闪卡）、plugin-entity（插件内容）。不传则搜索全部。",
      },
      limit: { type: "number", description: "返回结果数量，默认 5，最大 10" },
    },
    ["query"]
  ),
  execute: async input => {
    const query = text(input, "query")?.trim();
    if (!query) return ok({ success: false, error: "搜索关键词不能为空", results: [] });
    const types = Array.isArray(input.types)
      ? input.types.filter((value): value is string => SEARCH_TYPES.includes(value as string))
      : undefined;
    const limit = Math.min(Math.max(integer(input, "limit") ?? 5, 1), 10);
    const response = await tauri.searchAllContent({
      query,
      page: 1,
      pageSize: limit,
      ...(types?.length ? { types } : {}),
    });
    const results = response.items.map(item => ({
      id: item.id,
      type: item.type,
      title: item.title,
      excerpt: item.excerpt,
      contentId: item.contentId,
      date: item.date,
      container: item.containerTitle,
      updateTime: item.updateTime,
    }));
    return ok(
      results.length
        ? { success: true, count: results.length, total: response.total, results }
        : { success: true, message: "未找到相关内容", count: 0, results: [] }
    );
  },
};

export const getContentMarkdownTool: HostTool = {
  name: "get_content_markdown",
  risk: "read",
  description:
    "根据 contentId 获取 Markdown 全文（可选 range 截断）。注意：仅支持 contents.contentId，不支持 cardId/articleId/projectItemId。",
  inputSchema: objectSchema(
    {
      contentId: {
        type: "number",
        description: "contents 表中的 contentId。不是 cardId/articleId/projectItemId。",
      },
      range: {
        type: "array",
        description: "可选字符范围 [start, end]，用于截断返回内容",
        items: { type: "number" },
        minItems: 2,
        maxItems: 2,
      },
    },
    ["contentId"]
  ),
  execute: async input => {
    const contentId = integer(input, "contentId");
    if (!contentId) return failure("CONTENT_NOT_FOUND", "contentId 无效");
    let detail;
    try {
      detail = await tauri.getContentDetail(contentId);
    } catch {
      return failure("CONTENT_NOT_FOUND", "内容不存在或已删除", { contentId });
    }
    const markdown = mobileMarkdown.getMarkdown(detail.content as Descendant[]);
    const range = Array.isArray(input.range) ? (input.range as number[]) : null;
    const start = range ? Math.max(0, Math.floor(range[0] ?? 0)) : 0;
    const end = range
      ? Math.min(markdown.length, Math.floor(range[1] ?? markdown.length))
      : markdown.length;
    return ok({
      success: true,
      contentId,
      length: markdown.length,
      range: [start, end],
      truncated: start > 0 || end < markdown.length,
      markdown: markdown.slice(start, end),
    });
  },
};

/** 原生错误串 `CODE: message|hint` 拆成结构化字段 */
function sqlError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /^(SQL_[A-Z_]+):\s*([^|]*)(?:\|([\s\S]*))?$/.exec(raw);
  return match
    ? failure(match[1], match[2].trim(), match[3] ? { hint: match[3].trim() } : undefined)
    : failure("SQL_EXECUTION_ERROR", raw || "SQL 查询执行失败。");
}

export const sqlQueryTool = (databaseName: () => string): HostTool => ({
  name: "sql_query",
  risk: "read",
  description:
    "在当前主数据库执行单条只读 SQL 查询。优先使用显式列名、WHERE、JOIN 和 LIMIT；不要查询整表正文，正文 Markdown 和检索继续使用专用工具。使用前请先加载 database-schema 技能了解表结构。遇到 SQL 错误时请根据结构化错误反馈修正表名、字段名或语法后重试。",
  inputSchema: objectSchema(
    {
      sql: { type: "string", description: "单条 SELECT、WITH、EXPLAIN 或受限 PRAGMA 查询。" },
      params: {
        type: "object",
        additionalProperties: true,
        description: "可选的命名参数对象，值只能是字符串、数字、布尔值或 null。",
      },
      maxRows: { type: "number", description: "可选返回行数，默认 200，不能超过系统上限。" },
      timeoutMs: {
        type: "number",
        description: "可选查询超时，默认 3000 毫秒，不能超过系统上限。",
      },
    },
    ["sql"]
  ),
  execute: async input => {
    const sql = text(input, "sql");
    if (!sql?.trim()) return failure("SQL_READ_ONLY_VIOLATION", "SQL 不能为空。");
    try {
      const result = await tauri.aiSqlQuery(databaseName(), {
        sql,
        ...(input.params && typeof input.params === "object"
          ? { params: input.params as tauri.AiSqlQueryInput["params"] }
          : {}),
        ...(typeof input.maxRows === "number" ? { maxRows: input.maxRows } : {}),
        ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
      });
      return ok({ success: true, ...result });
    } catch (error) {
      return sqlError(error);
    }
  },
});
