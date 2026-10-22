/**
 * 插件自有数据（实体、记录）的通用查询：把 SDK 校验过的条件与排序拼成 SQL，键集分页。
 * 索引字段从 JSON 列按类型取值，类型不符的值视为 NULL；字段名只允许标识符字符，可以直接拼入路径。
 */
import { createHash } from "node:crypto";
import {
  isIndexFieldName,
  type PluginIndexType,
  type PluginIndexValue,
  type PluginQueryCondition,
  type PluginQueryOrder,
} from "@tau/plugins/query";

type SqlValue = string | number | null;

export interface QuerySource {
  /** 存放索引字段的 JSON 列，如 `e.meta` */
  json: string;
  /** 自带的可排序列：SDK 名 → SQL 表达式 */
  builtins: Record<string, string>;
  /** 兜底排序的唯一列 */
  id: string;
}

export interface SqlFragment {
  sql: string;
  params: SqlValue[];
}

const JSON_TYPES: Record<PluginIndexType, string> = {
  string: "('text')",
  number: "('integer', 'real')",
  boolean: "('true', 'false')",
};

/** 按声明的类型取出索引字段，类型不符为 NULL；布尔值为 1 / 0 */
export function indexExpression(source: QuerySource, field: string, type: PluginIndexType) {
  if (!isIndexFieldName(field)) throw new Error(`索引字段名无效：${field}`);
  const path = `'$.${field}'`;
  return `(CASE WHEN json_type(${source.json}, ${path}) IN ${JSON_TYPES[type]} THEN json_extract(${source.json}, ${path}) END)`;
}

const toSql = (value: PluginIndexValue | null): SqlValue =>
  typeof value === "boolean" ? (value ? 1 : 0) : value;

const COMPARE: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=" };

/** 筛选条件；条件之间为「且」 */
export function whereClause(source: QuerySource, conditions: PluginQueryCondition[]): SqlFragment {
  const parts: string[] = [];
  const params: SqlValue[] = [];
  for (const condition of conditions) {
    const column = indexExpression(source, condition.field, condition.type);
    const { op, value } = condition;
    if (op === "eq" || op === "ne") {
      parts.push(`${column} ${op === "eq" ? "IS" : "IS NOT"} ?`);
      params.push(toSql(value as PluginIndexValue | null));
    } else if (op === "in") {
      const values = value as (PluginIndexValue | null)[];
      const present = values.filter(item => item !== null);
      const options = present.length ? [`${column} IN (${present.map(() => "?").join(", ")})`] : [];
      if (present.length !== values.length) options.push(`${column} IS NULL`);
      parts.push(`(${options.join(" OR ")})`);
      params.push(...present.map(toSql));
    } else {
      const operator = COMPARE[op];
      if (!operator) throw new Error(`未知的运算符：${op}`);
      parts.push(`${column} ${operator} ?`);
      params.push(toSql(value as PluginIndexValue));
    }
  }
  return { sql: parts.join(" AND "), params };
}

interface OrderColumn {
  sql: string;
  direction: "asc" | "desc";
}

function orderColumns(source: QuerySource, order: PluginQueryOrder[]): OrderColumn[] {
  const columns = order.map(item => {
    if ("builtin" in item) {
      const sql = source.builtins[item.builtin];
      if (!sql) throw new Error(`字段 ${item.builtin} 不能用于排序`);
      return { sql, direction: item.direction };
    }
    return { sql: indexExpression(source, item.field, item.type), direction: item.direction };
  });
  // ID 兜底，方向跟随最后一个排序项
  columns.push({ sql: source.id, direction: columns.at(-1)?.direction ?? "desc" });
  return columns;
}

/**
 * 键集条件：排在 values 之后的行。SQLite 升序时 NULL 最前、降序时最后，
 * 这里按同一规则比较：升序时 NULL 之后是所有非 NULL，降序时 NULL 之后没有行。
 */
function afterClause(columns: OrderColumn[], values: SqlValue[]): SqlFragment {
  const options: string[] = [];
  const params: SqlValue[] = [];
  columns.forEach((column, index) => {
    const value = values[index];
    let after: string | null;
    const afterParams: SqlValue[] = [];
    if (column.direction === "asc") {
      if (value === null) after = `${column.sql} IS NOT NULL`;
      else {
        after = `${column.sql} > ?`;
        afterParams.push(value);
      }
    } else if (value === null) after = null;
    else {
      after = `(${column.sql} < ? OR ${column.sql} IS NULL)`;
      afterParams.push(value);
    }
    if (after === null) return;
    const equal = columns.slice(0, index).map(previous => `${previous.sql} IS ?`);
    options.push(`(${[...equal, after].join(" AND ")})`);
    params.push(...values.slice(0, index), ...afterParams);
  });
  return { sql: options.length ? `(${options.join(" OR ")})` : "0", params };
}

/** 游标绑定查询：换了筛选或排序后拒绝旧游标 */
function fingerprint(scope: unknown): string {
  return createHash("sha256").update(JSON.stringify(scope)).digest("base64url").slice(0, 16);
}

function decodeCursor(cursor: string, expected: string, width: number): SqlValue[] {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      f?: unknown;
      v?: unknown;
    };
    const values = parsed.v;
    if (
      parsed.f === expected &&
      Array.isArray(values) &&
      values.length === width &&
      values.every(value => value === null || ["string", "number"].includes(typeof value))
    )
      return values as SqlValue[];
  } catch {
    // 落到下方统一报错
  }
  throw new Error("分页游标无效或已不适用于当前查询");
}

export interface PageQuery {
  /** SELECT 的列 */
  columns: string;
  /** FROM 子句（含 JOIN），不含 WHERE */
  from: string;
  /** 已有的筛选（插件、类型等），与条件之间为「且」 */
  filters: SqlFragment[];
  order: PluginQueryOrder[];
  cursor?: string;
  limit: number;
  /** 参与游标指纹的查询参数（筛选与排序） */
  scope: unknown;
}

/** 执行一页查询，返回行与下一页游标 */
export function runPage<Row>(
  db: { prepare(sql: string): { all(...params: unknown[]): unknown[] } },
  source: QuerySource,
  query: PageQuery
): { rows: Row[]; cursor?: string } {
  const columns = orderColumns(source, query.order);
  const print = fingerprint(query.scope);
  const filters = query.filters.filter(filter => filter.sql);
  if (query.cursor !== undefined)
    filters.push(afterClause(columns, decodeCursor(query.cursor, print, columns.length)));
  const keys = columns.map((column, index) => `${column.sql} AS __k${index}`).join(", ");
  const where = filters.length ? ` WHERE ${filters.map(filter => filter.sql).join(" AND ")}` : "";
  const orderBy = columns
    .map(column => `${column.sql} ${column.direction === "asc" ? "ASC" : "DESC"}`)
    .join(", ");
  const result = db
    .prepare(
      `SELECT ${query.columns}, ${keys} FROM ${query.from}${where} ORDER BY ${orderBy} LIMIT ?`
    )
    .all(...filters.flatMap(filter => filter.params), query.limit + 1) as Array<
    Row & Record<string, SqlValue>
  >;
  const page = result.slice(0, query.limit);
  const last = page.at(-1);
  return {
    rows: page,
    ...(result.length > query.limit && last
      ? {
          cursor: Buffer.from(
            JSON.stringify({ f: print, v: columns.map((_, index) => last[`__k${index}`]) })
          ).toString("base64url"),
        }
      : {}),
  };
}

/** 标题包含：转义 LIKE 通配符 */
export function containsClause(column: string, text: string): SqlFragment {
  return { sql: `${column} LIKE ? ESCAPE '\\'`, params: [`%${text.replace(/[\\%_]/g, "\\$&")}%`] };
}
