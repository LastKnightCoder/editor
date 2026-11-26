export type QueryValue =
  | null
  | string
  | number
  | boolean
  | QueryValue[]
  | { [key: string]: QueryValue };
export type QueryRecord = { id: string; [key: string]: QueryValue };
export type QueryColumnType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "multiSelect"
  | "entity"
  | "json";
export type QuerySource =
  | "cards"
  | "articles"
  | "projects"
  | "documents"
  | "todos"
  | "calendar"
  | "diary"
  | "tables"
  | "whiteboards"
  | "notebooks"
  | "materials"
  | "chats"
  | "contents";

export interface QueryDefinition {
  version: 1;
  language: "dsl" | "javascript";
  code: string;
  params?: Record<string, QueryValue>;
}

export interface QueryColumn {
  key: string;
  title: string;
  type: QueryColumnType;
  options?: string[];
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: { id: string; values: Record<string, QueryValue> }[];
}

export interface QueryReadRequest {
  source: QuerySource;
  options?: Record<string, QueryValue>;
  cursor?: string;
}
export interface QueryReadPage {
  items: QueryRecord[];
  cursor?: string;
  fields?: QueryColumn[];
}
export interface QueryContext {
  now: number;
  today: string;
  timeZone: string;
  params: Record<string, QueryValue>;
  documentId?: string;
  projectId?: string;
}
export type QueryReader = (request: QueryReadRequest) => Promise<QueryReadPage>;

export const QUERY_LIMITS = {
  concurrency: 4,
  backlog: 64,
  resultRows: 20_000,
  readRows: 50_000,
  bytes: 16_000_000,
  timeoutMs: 15_000,
  codeLength: 100_000,
} as const;
export const DEFAULT_QUERY_CODE =
  'TABLE title AS "内容", tags AS "标签", updatedAt AS "更新时间"\nFROM cards\nWHERE hasTag("读书")\nSORT updatedAt DESC';

export function querySerializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function readQueryDefinition(value: unknown): QueryDefinition {
  if (!value || typeof value !== "object") throw new Error("查询定义无效");
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !["dsl", "javascript"].includes(String(input.language)))
    throw new Error("不支持的查询语言或版本");
  if (typeof input.code !== "string" || input.code.length > QUERY_LIMITS.codeLength)
    throw new Error("查询代码必须是文本且不超过 100000 字符");
  if (
    input.params !== undefined &&
    (!input.params || typeof input.params !== "object" || Array.isArray(input.params))
  )
    throw new Error("查询参数必须是对象");
  return {
    version: 1,
    language: input.language as QueryDefinition["language"],
    code: input.code,
    ...(input.params ? { params: JSON.parse(JSON.stringify(input.params)) } : {}),
  };
}
