import type { PluginDataQuery } from "@/types/plugin-data";

const MAX_LIMIT = 200;

const optionalTime = (value: unknown, name: string) => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${name} 无效`);
  return value as number;
};

/**
 * 插件数据分页查询的公共部分：时间范围、「排序时间:键」游标与条数。外层 SQL 需投影出
 * created / updated 与键列，按 `${sort} DESC, 键 DESC` 排序并多取一条判断是否还有下一页。
 */
export function readPageQuery(
  query: PluginDataQuery,
  key: { column: string; numeric: boolean }
): { sort: "created" | "updated"; limit: number; where: string[]; params: unknown[] } {
  const limit = query.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new Error(`limit 必须是 1–${MAX_LIMIT} 的整数`);
  const sort = query.sort === "created" ? "created" : "updated";
  const where: string[] = [];
  const params: unknown[] = [];
  const range = (column: string, after: unknown, before: unknown, label: string) => {
    const from = optionalTime(after, `${label}起点`);
    const to = optionalTime(before, `${label}终点`);
    if (from !== undefined) {
      where.push(`${column} >= ?`);
      params.push(from);
    }
    if (to !== undefined) {
      where.push(`${column} < ?`);
      params.push(to);
    }
  };
  range("created", query.createdAfter, query.createdBefore, "创建时间");
  range("updated", query.updatedAfter, query.updatedBefore, "更新时间");
  if (query.cursor !== undefined) {
    const match = (key.numeric ? /^(\d+):(\d+)$/ : /^(\d+):(.+)$/).exec(String(query.cursor));
    if (!match) throw new Error("分页游标无效");
    where.push(`(${sort} < ? OR (${sort} = ? AND ${key.column} < ?))`);
    params.push(Number(match[1]), Number(match[1]), key.numeric ? Number(match[2]) : match[2]);
  }
  return { sort, limit, where, params };
}

/** 截取一页并给出下一页的游标 */
export function toPage<Row extends { created: number; updated: number }>(
  rows: Row[],
  limit: number,
  sort: "created" | "updated",
  keyOf: (row: Row) => string | number
): { rows: Row[]; cursor?: string } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page,
    ...(rows.length > limit && last ? { cursor: `${last[sort]}:${keyOf(last)}` } : {}),
  };
}
