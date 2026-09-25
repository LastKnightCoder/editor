import type Database from "better-sqlite3";

export type SqlQueryParam = string | number | boolean | null;

export interface SqlQueryInput {
  sql: string;
  params?: SqlQueryParam[] | Record<string, SqlQueryParam>;
  maxRows?: number;
  timeoutMs?: number;
}

export interface SqlQueryResult {
  columns: Array<{ name: string; declaredType?: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  returnedRowCount: number;
  truncated: boolean;
  durationMs: number;
}

export type SqlQueryErrorCode =
  | "SQL_READ_ONLY_VIOLATION"
  | "SQL_SYNTAX_ERROR"
  | "SQL_SCHEMA_ERROR"
  | "SQL_TIMEOUT"
  | "SQL_RESULT_LIMIT"
  | "SQL_EXECUTION_ERROR";

export class SqlQueryError extends Error {
  readonly code: SqlQueryErrorCode;
  readonly hint?: string;

  constructor(code: SqlQueryErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "SqlQueryError";
    this.code = code;
    this.hint = hint;
  }
}

const MAX_ROWS = 2000;
const DEFAULT_ROWS = 200;
const MAX_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_CELL_LENGTH = 20_000;
const MAX_RESULT_BYTES = 1_000_000;

const isParamRecord = (params: SqlQueryInput["params"]): params is Record<string, SqlQueryParam> =>
  Boolean(params) && !Array.isArray(params) && typeof params === "object";

const scanSql = (sql: string) => {
  let quote: "'" | '"' | "`" | "[" | null = null;
  let hasStatementTerminator = false;
  // normalized 剔除引号内容并小写化，只用于防护检查（防止字面量藏语句绕过关键字检测）；
  // 实际执行的语句必须用原文，否则字符串字面量会被剥掉导致语法错误。
  let normalized = "";

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (quote) {
      if (quote === "[" && char === "]") quote = null;
      else if (quote !== "[" && char === quote) {
        if (sql[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`" || char === "[") {
      quote = char;
      continue;
    }
    if (char === "-" && next === "-") {
      throw new SqlQueryError(
        "SQL_READ_ONLY_VIOLATION",
        "SQL 不允许包含注释。",
        "请删除注释后重新提交单条查询。"
      );
    }
    if (char === "/" && next === "*") {
      throw new SqlQueryError(
        "SQL_READ_ONLY_VIOLATION",
        "SQL 不允许包含注释。",
        "请删除注释后重新提交单条查询。"
      );
    }
    if (char === ";") hasStatementTerminator = true;
    normalized += char.toLowerCase();
  }

  const withoutWhitespace = normalized.trim();
  const firstKeyword = withoutWhitespace.match(/^([a-z_]+)/)?.[1] ?? "";
  const isPragma = firstKeyword === "pragma";
  const isAllowedStart = ["select", "with", "explain", "pragma"].includes(firstKeyword);
  if (!isAllowedStart) {
    throw new SqlQueryError(
      "SQL_READ_ONLY_VIOLATION",
      "只允许执行 SELECT、WITH、EXPLAIN 和受限 PRAGMA 查询。",
      "请将查询改为只读查询。"
    );
  }
  if (
    /\b(insert|update|delete|alter|drop|create|vacuum|attach|detach|begin|commit|rollback|reindex|analyze)\b/.test(
      withoutWhitespace
    )
  ) {
    throw new SqlQueryError(
      "SQL_READ_ONLY_VIOLATION",
      "查询中包含不允许的写入或数据库管理语句。",
      "请只保留 SELECT 查询和必要的只读 CTE。"
    );
  }
  if (
    isPragma &&
    !/^pragma\s+(table_info|foreign_key_list|index_list)\s*\(/.test(withoutWhitespace)
  ) {
    throw new SqlQueryError(
      "SQL_READ_ONLY_VIOLATION",
      "只允许使用 table_info、foreign_key_list 和 index_list PRAGMA。",
      "请使用受支持的结构探查 PRAGMA。"
    );
  }
  const terminatorIndex = withoutWhitespace.indexOf(";");
  if (hasStatementTerminator && terminatorIndex !== withoutWhitespace.length - 1) {
    throw new SqlQueryError(
      "SQL_READ_ONLY_VIOLATION",
      "只允许执行单条 SQL 查询。",
      "请删除多余的语句。"
    );
  }
  return sql.trim().replace(/;\s*$/, "");
};

const toJsonValue = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (typeof value === "string" && value.length > MAX_CELL_LENGTH) {
    return `${value.slice(0, MAX_CELL_LENGTH)}…`;
  }
  return value;
};

const toError = (error: unknown): SqlQueryError => {
  if (error instanceof SqlQueryError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("syntax")) {
    return new SqlQueryError(
      "SQL_SYNTAX_ERROR",
      "SQL 语法错误，请检查关键字、括号和逗号。",
      message
    );
  }
  if (
    lower.includes("no such table") ||
    lower.includes("no such column") ||
    lower.includes("ambiguous")
  ) {
    return new SqlQueryError(
      "SQL_SCHEMA_ERROR",
      "查询引用了不存在或不明确的表/字段。",
      "请读取 database-schema Skill 后修正表名和字段名。"
    );
  }
  return new SqlQueryError(
    "SQL_EXECUTION_ERROR",
    "SQL 查询执行失败。",
    "请缩小查询范围或修正 SQL 后重试。"
  );
};

export const executeReadOnlySql = (
  database: Database.Database,
  input: SqlQueryInput
): SqlQueryResult => {
  const startedAt = Date.now();
  const sql = scanSql(input.sql);
  // IPC 传参可能带 NaN，clamp 前必须先回退默认值，否则 Math.min/max 会静默产出 NaN
  const requestedRows =
    typeof input.maxRows === "number" && Number.isFinite(input.maxRows)
      ? Math.floor(input.maxRows)
      : DEFAULT_ROWS;
  const requestedTimeout =
    typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
      ? Math.floor(input.timeoutMs)
      : DEFAULT_TIMEOUT_MS;
  const maxRows = Math.min(Math.max(requestedRows, 1), MAX_ROWS);
  const timeoutMs = Math.min(Math.max(requestedTimeout, 100), MAX_TIMEOUT_MS);
  const statement = (() => {
    try {
      return database.prepare(sql);
    } catch (error) {
      throw toError(error);
    }
  })();
  const timeout = setTimeout(() => {
    const interrupt = (database as Database.Database & { interrupt?: () => void }).interrupt;
    interrupt?.();
  }, timeoutMs);
  try {
    if (!statement.reader) {
      throw new SqlQueryError(
        "SQL_READ_ONLY_VIOLATION",
        "该 SQL 不会返回查询结果，已拒绝执行。",
        "请使用 SELECT 或受限结构探查 PRAGMA。"
      );
    }
    const columns = statement.columns().map(column => ({
      name: column.name,
      declaredType: column.column === null ? undefined : (column.type ?? undefined),
    }));
    const rows: Array<Record<string, unknown>> = [];
    let truncated = false;
    let resultBytes = 0;
    const boundParameters = isParamRecord(input.params) ? [input.params] : (input.params ?? []);
    for (const row of statement.iterate(...boundParameters)) {
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
      const converted = Object.fromEntries(
        Object.entries(row as Record<string, unknown>).map(([key, value]) => [
          key,
          toJsonValue(value),
        ])
      );
      resultBytes += JSON.stringify(converted).length + 1;
      rows.push(converted);
      if (resultBytes > MAX_RESULT_BYTES) {
        rows.pop();
        truncated = true;
        break;
      }
    }
    return {
      columns,
      rows,
      rowCount: rows.length,
      returnedRowCount: rows.length,
      truncated,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const normalized = toError(error);
    if (database.open === false || normalized.message.toLowerCase().includes("interrupted")) {
      throw new SqlQueryError(
        "SQL_TIMEOUT",
        "SQL 查询超时。",
        "请增加过滤条件、缩小范围或降低 JOIN 复杂度。"
      );
    }
    throw normalized;
  } finally {
    clearTimeout(timeout);
  }
};
