import { invoke } from "@/electron";
import type { ToolParameterSchema } from "@/types";
import type { MCPProviderDefinition } from "./types";

export const sqlQueryToolsProvider: MCPProviderDefinition = {
  id: "sql-query-tools",
  name: "只读 SQL 查询工具",
  description:
    "查询当前主数据库中的结构化业务数据。只能执行单条只读 SELECT/WITH/EXPLAIN 或受限结构探查 PRAGMA；不能修改数据。使用前请先读取 database-schema Skill。",
  defaultEnabled: true,
  tools: () => [
    {
      name: "sql_query",
      description:
        "在当前主数据库执行单条只读 SQL 查询。优先使用显式列名、WHERE、JOIN 和 LIMIT；不要查询整表正文，正文 Markdown 和语义检索继续使用专用工具。遇到 SQL 错误时请根据结构化错误反馈修正表名、字段名或语法后重试。",
      parameters: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "单条 SELECT、WITH、EXPLAIN 或受限 PRAGMA 查询。",
          },
          params: {
            type: "object",
            additionalProperties: true,
            description: "可选的命名参数对象，值只能是字符串、数字、布尔值或 null。",
          },
          maxRows: {
            type: "number",
            description: "可选返回行数，默认 200，不能超过系统上限。",
          },
          timeoutMs: {
            type: "number",
            description: "可选查询超时，默认 3000 毫秒，不能超过系统上限。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["sql"],
        additionalProperties: false,
      },
      executor: async args => {
        const response = await invoke<{
          result?: unknown;
          error?: { code: string; message: string; hint?: string };
        }>("sql-query", {
          sql: String(args.sql ?? ""),
          params: args.params,
          maxRows: args.maxRows,
          timeoutMs: args.timeoutMs,
        });
        if (response.error) {
          return {
            content: JSON.stringify({ error: response.error }, null, 2),
            isParameterError:
              response.error.code.startsWith("SQL_") &&
              response.error.code !== "SQL_EXECUTION_ERROR",
          };
        }
        return { content: JSON.stringify(response.result ?? {}, null, 2) };
      },
    },
  ],
};
