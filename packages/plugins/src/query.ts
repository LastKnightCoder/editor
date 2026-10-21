/**
 * 插件自有数据（插件实体、记录）的查询：按声明的索引字段筛选与排序。
 * 子路径 `@tau/plugins/query` 供宿主主进程复核写入的值与查询参数。
 */
import type { JsonValue } from "./json";

/** 索引字段的类型 */
export type PluginIndexType = "string" | "number" | "boolean";

/** 字段名 → 类型；字段取自 meta（实体）或 data（记录）的顶层键 */
export type PluginIndexes = Record<string, PluginIndexType>;

export type PluginIndexValue = string | number | boolean;

/**
 * 一个字段的条件。直接给值表示等于，`null` 表示没有值（缺失或为 null）；
 * 同一对象里的多个运算符同时成立。类型与声明不符的值按没有值处理。
 */
export type PluginFieldCondition =
  | PluginIndexValue
  | null
  | {
      eq?: PluginIndexValue | null;
      /** 不等于；没有值的也算不等于 */
      ne?: PluginIndexValue | null;
      /** 等于其中之一，可以包含 null */
      in?: (PluginIndexValue | null)[];
      gt?: string | number;
      gte?: string | number;
      lt?: string | number;
      lte?: string | number;
    };

export type PluginWhere = Record<string, PluginFieldCondition>;

export interface PluginOrderBy {
  field: string;
  /** 默认 asc；升序时没有值的排在最前，降序时排在最后 */
  direction?: "asc" | "desc";
}

export type PluginQueryOperator = "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte";

/** 校验后的条件：字段已声明，值与类型一致 */
export interface PluginQueryCondition {
  field: string;
  type: PluginIndexType;
  op: PluginQueryOperator;
  value: PluginIndexValue | null | (PluginIndexValue | null)[];
}

/** 校验后的排序；builtin 为宿主自带的列（如创建时间），否则为索引字段 */
export type PluginQueryOrder =
  | { builtin: string; direction: "asc" | "desc" }
  | { field: string; type: PluginIndexType; direction: "asc" | "desc" };

export const QUERY_LIMITS = {
  indexes: 16,
  conditions: 16,
  inValues: 100,
  orderBy: 2,
  textValue: 1000,
} as const;

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const INDEX_TYPES = new Set<string>(["string", "number", "boolean"]);
const OPERATORS = new Set<string>(["eq", "ne", "in", "gt", "gte", "lt", "lte"]);

export const isIndexFieldName = (value: unknown): value is string =>
  typeof value === "string" && FIELD_NAME.test(value);

/** 校验索引声明；reserved 为宿主自带的排序列名，不能用作索引字段 */
export function readIndexes(value: unknown, reserved: readonly string[] = []): PluginIndexes {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("indexes 必须是对象");
  const entries = Object.entries(value);
  if (entries.length > QUERY_LIMITS.indexes)
    throw new Error(`indexes 最多 ${QUERY_LIMITS.indexes} 个字段`);
  const indexes: PluginIndexes = {};
  for (const [field, type] of entries) {
    if (!isIndexFieldName(field)) throw new Error(`索引字段名无效：${field}`);
    if (reserved.includes(field)) throw new Error(`索引字段名 ${field} 已被宿主使用`);
    if (typeof type !== "string" || !INDEX_TYPES.has(type))
      throw new Error(`索引字段 ${field} 的类型无效`);
    indexes[field] = type as PluginIndexType;
  }
  return Object.freeze(indexes);
}

function typeOf(value: unknown): PluginIndexType | null {
  if (typeof value === "string") return "string";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "boolean";
  return null;
}

function readValue(field: string, type: PluginIndexType, value: unknown, nullable: boolean) {
  if (value === null && nullable) return null;
  if (typeOf(value) !== type) throw new Error(`字段 ${field} 的值必须是 ${type}`);
  if (type === "string" && (value as string).length > QUERY_LIMITS.textValue)
    throw new Error(`字段 ${field} 的值过长`);
  return value as PluginIndexValue;
}

/** 校验筛选条件，字段必须已在 indexes 中声明 */
export function readWhere(value: unknown, indexes: PluginIndexes): PluginQueryCondition[] {
  if (value === undefined) return [];
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("where 必须是对象");
  const conditions: PluginQueryCondition[] = [];
  for (const [field, raw] of Object.entries(value)) {
    const type = Object.hasOwn(indexes, field) ? indexes[field] : undefined;
    if (!type) throw new Error(`字段 ${field} 未声明为索引`);
    if (raw === null || typeof raw !== "object") {
      conditions.push({ field, type, op: "eq", value: readValue(field, type, raw, true) });
      continue;
    }
    if (Array.isArray(raw)) throw new Error(`字段 ${field} 的条件无效，多个取值请用 in`);
    const operators = Object.entries(raw).filter(([, operand]) => operand !== undefined);
    if (!operators.length) throw new Error(`字段 ${field} 的条件为空`);
    for (const [op, operand] of operators) {
      if (!OPERATORS.has(op)) throw new Error(`未知的运算符：${op}`);
      if (op === "in") {
        if (!Array.isArray(operand) || !operand.length || operand.length > QUERY_LIMITS.inValues)
          throw new Error(`in 需要 1–${QUERY_LIMITS.inValues} 个取值`);
        conditions.push({
          field,
          type,
          op,
          value: operand.map(item => readValue(field, type, item, true)),
        });
      } else if (op === "eq" || op === "ne") {
        conditions.push({
          field,
          type,
          op,
          value: readValue(field, type, operand, true),
        });
      } else {
        if (type === "boolean") throw new Error(`布尔字段 ${field} 不能比较大小`);
        conditions.push({
          field,
          type,
          op: op as PluginQueryOperator,
          value: readValue(field, type, operand, false),
        });
      }
    }
  }
  if (conditions.length > QUERY_LIMITS.conditions)
    throw new Error(`筛选条件最多 ${QUERY_LIMITS.conditions} 个`);
  return conditions;
}

/** 校验排序；builtins 为宿主自带的可排序列 */
export function readOrderBy(
  value: unknown,
  indexes: PluginIndexes,
  builtins: readonly string[]
): PluginQueryOrder[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  if (!list.length || list.length > QUERY_LIMITS.orderBy)
    throw new Error(`orderBy 需要 1–${QUERY_LIMITS.orderBy} 项`);
  return list.map(item => {
    const { field, direction = "asc" } = (item ?? {}) as PluginOrderBy;
    if (direction !== "asc" && direction !== "desc") throw new Error("排序方向无效");
    if (typeof field === "string" && builtins.includes(field)) return { builtin: field, direction };
    const type = typeof field === "string" && Object.hasOwn(indexes, field) ? indexes[field] : null;
    if (!type) throw new Error(`字段 ${String(field)} 不能用于排序`);
    return { field, type, direction };
  });
}

/** 写入前核对：已声明为索引的字段，值必须是声明的类型或 null */
export function assertIndexedValues(
  values: Record<string, JsonValue | undefined>,
  indexes: PluginIndexes
) {
  for (const [field, type] of Object.entries(indexes)) {
    const value = values[field];
    if (value === undefined || value === null) continue;
    if (typeOf(value) !== type) throw new Error(`索引字段 ${field} 的值必须是 ${type}`);
  }
}
