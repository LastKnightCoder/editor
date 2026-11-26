import type { QueryColumn, QueryColumnType, QueryResult, QueryValue } from "./types";
import { QUERY_LIMITS, querySerializedBytes } from "./types";

const types = new Set<QueryColumnType>([
  "text",
  "number",
  "boolean",
  "date",
  "select",
  "multiSelect",
  "entity",
  "json",
]);
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
function json(value: unknown, depth = 0): QueryValue {
  if (depth > 20) throw new Error("查询值嵌套过深");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => json(item, depth + 1));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (forbidden.has(key)) throw new Error("无效的查询字段名");
        return [key, json(item, depth + 1)];
      })
    );
  }
  throw new Error("查询结果只能包含可序列化的有限数值、文本、布尔值、数组和对象");
}
function validateCell(value: unknown, column: QueryColumn): QueryValue {
  if (value === undefined || value === null) return null;
  const valid =
    column.type === "json" ||
    (column.type === "text" || column.type === "select"
      ? typeof value === "string"
      : column.type === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : column.type === "boolean"
          ? typeof value === "boolean"
          : column.type === "multiSelect"
            ? Array.isArray(value) && value.every(item => typeof item === "string")
            : column.type === "date"
              ? (typeof value === "number" &&
                  Number.isFinite(value) &&
                  !Number.isNaN(new Date(value).getTime())) ||
                (typeof value === "string" &&
                  /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) &&
                  !Number.isNaN(Date.parse(value)))
              : typeof value === "object" &&
                !Array.isArray(value) &&
                "kind" in value &&
                typeof value.kind === "string" &&
                value.kind.length > 0 &&
                "id" in value &&
                ((typeof value.id === "string" && value.id.length > 0) ||
                  (typeof value.id === "number" && Number.isFinite(value.id))));
  if (!valid) throw new Error(`列「${column.title}」的值不符合 ${column.type} 类型`);
  return json(value);
}
export function validateQueryResult(input: unknown): QueryResult {
  if (
    !input ||
    typeof input !== "object" ||
    !("columns" in input) ||
    !("rows" in input) ||
    !Array.isArray(input.columns) ||
    !Array.isArray(input.rows)
  )
    throw new Error("脚本需要返回 { columns, rows }");
  if (!input.columns.length || input.columns.length > 100) throw new Error("查询需要返回 1–100 列");
  if (input.rows.length > QUERY_LIMITS.resultRows)
    throw new Error("查询结果过多，请使用筛选或 LIMIT 缩小范围");
  const keys = new Set<string>();
  const columns = input.columns.map((value: unknown): QueryColumn => {
    if (!value || typeof value !== "object") throw new Error("列定义无效");
    const column = value as Record<string, unknown>;
    if (
      typeof column.key !== "string" ||
      !column.key ||
      column.key.length > 200 ||
      forbidden.has(column.key) ||
      keys.has(column.key)
    )
      throw new Error("列 key 必须唯一且有效");
    if (typeof column.title !== "string" || !types.has(column.type as QueryColumnType))
      throw new Error(`列 ${column.key} 缺少名称或有效类型`);
    if (
      column.options !== undefined &&
      (!Array.isArray(column.options) ||
        !column.options.every(option => typeof option === "string"))
    )
      throw new Error("字段选项必须是文本数组");
    keys.add(column.key);
    return {
      key: column.key,
      title: column.title,
      type: column.type as QueryColumnType,
      ...(column.options ? { options: [...new Set(column.options as string[])] } : {}),
    };
  });
  const ids = new Set<string>();
  const rows = input.rows.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("查询行无效");
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || ids.has(row.id))
      throw new Error("每行需要唯一、稳定的字符串 id");
    if (!row.values || typeof row.values !== "object" || Array.isArray(row.values))
      throw new Error(`行 ${row.id} 缺少 values`);
    ids.add(row.id);
    return {
      id: row.id,
      values: Object.fromEntries(
        columns.map(column => [
          column.key,
          validateCell((row.values as Record<string, unknown>)[column.key], column),
        ])
      ),
    };
  });
  const result = { columns, rows };
  if (querySerializedBytes(result) > QUERY_LIMITS.bytes)
    throw new Error("查询结果体积过大，请减少字段或缩小范围");
  return result;
}
