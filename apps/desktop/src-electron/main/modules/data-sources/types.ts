import type Database from "better-sqlite3";
import type { CommandContext } from "@tau/rpc";
import type { CellValue, DataTableSourceScope } from "@tau/shared/database-types";
import type { SourceDef } from "@/features/databases/data-sources";

/** 源头的一行：实体 id、正文 id（行详情打开它）与各字段的原始值（标签为名称数组） */
export interface SourceRow {
  id: number;
  contentId?: number;
  values: Record<string, CellValue>;
}

/** 新建弹窗的范围候选项 */
export interface SourceScopeOptions {
  tags?: string[];
  projects?: { id: number; title: string }[];
}

export interface DataSourceDefinition {
  def: SourceDef;
  scopeOptions(db: Database.Database): SourceScopeOptions;
  /** 范围内的实体 id，按源头顺序；只查 id，供行数统计 */
  ids(db: Database.Database, scope: DataTableSourceScope): number[];
  list(db: Database.Database, scope: DataTableSourceScope): SourceRow[];
  /** 仍存在的实体（不论是否在范围内），用于清理已删除条目的自建列值 */
  existing(db: Database.Database, ids: number[]): Set<number>;
  /** patch 只含可写字段；返回需在事务提交后执行的协作标题发布 */
  write?(
    db: Database.Database,
    id: number,
    patch: Record<string, CellValue>,
    ctx: CommandContext
  ): (() => void) | void;
  create?(db: Database.Database, scope: DataTableSourceScope, ctx: CommandContext): number;
  remove(db: Database.Database, id: number, ctx: CommandContext): void;
}

const placeholders = (ids: readonly unknown[]) => ids.map(() => "?").join(",");

/** 大量 id 的 IN 查询分批执行，避开 SQLite 参数上限 */
export function selectExisting(db: Database.Database, table: string, ids: number[], where = "") {
  const found = new Set<number>();
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    const rows = db
      .prepare(`SELECT id FROM ${table} WHERE id IN (${placeholders(batch)})${where}`)
      .all(...batch) as { id: number }[];
    for (const row of rows) found.add(row.id);
  }
  return found;
}

export function parseTags(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

/** 按标签范围筛选：选中父标签时子标签（父/子）也算 */
export function matchesTags(tags: readonly string[], scope: DataTableSourceScope) {
  const wanted = scope.tags ?? [];
  if (!wanted.length) return true;
  return tags.some(tag => wanted.some(target => tag === target || tag.startsWith(`${target}/`)));
}

export const dateValue = (time: number | null | undefined) =>
  typeof time === "number" && Number.isFinite(time) ? { start: time, end: null } : null;

export function sortedTags(rows: { tags: string | null }[]) {
  const set = new Set<string>();
  for (const row of rows) for (const tag of parseTags(row.tags)) set.add(tag);
  return [...set].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

/** 可写字段里的标签值：名称数组，其余类型丢弃 */
export function tagPatch(value: CellValue): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}
