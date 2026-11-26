import { QUERY_LIMITS, QUERY_SOURCES, type QueryDefinition } from "@tau/shared/query-database";
import reference from "./skills/internal/query-database-reference.md?raw";

const catalog = Object.entries(QUERY_SOURCES)
  .map(
    ([name, source]) =>
      `| ${name} | ${source.fields.map(field => `${field.key}:${field.type}`).join(", ")} |`
  )
  .join("\n");

export const QUERY_DATABASE_REFERENCE = `${reference}

## 数据来源与字段类型

| 来源 | 字段名:类型 |
| --- | --- |
${catalog}

tables 除 id 外的字段由目标普通表决定，必须使用真实的表编号和字段 ID。

## 执行预算

每次查询累计读取最多 ${QUERY_LIMITS.readRows} 行，结果最多 ${QUERY_LIMITS.resultRows} 行、1–100 列。
读取和结果各受 ${QUERY_LIMITS.bytes} 个 UTF-8 字节限制；等待与运行共用 ${QUERY_LIMITS.timeoutMs / 1000} 秒。
代码不超过 ${QUERY_LIMITS.codeLength} 个字符。超限会明确失败，不截断成成功结果。
`.trim();

export interface QueryDatabaseAssistanceInput {
  definition: QueryDefinition;
  request: string;
  error?: string;
}

export function buildQueryDatabaseMessages({
  definition,
  request,
  error,
}: QueryDatabaseAssistanceInput) {
  return [
    {
      role: "system" as const,
      content: `为 Tau 只读查询数据库编写 ${definition.language === "dsl" ? "DSL" : "JavaScript"}。仅返回代码正文，不包代码围栏、不输出解释。遵循下列完整参考，保留用户没有要求更改的列 key 和来源范围。\n\n${QUERY_DATABASE_REFERENCE}`,
    },
    {
      role: "user" as const,
      content: `当前语言：${definition.language}\n当前代码：\n${definition.code}\n\n当前查询参数：\n${JSON.stringify(definition.params ?? {})}\n\n需求：${request}${error ? `\n\n最近一次运行错误（以当前代码为准）：${error}` : ""}`,
    },
  ];
}
