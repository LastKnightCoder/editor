/**
 * 关联表的合并与拆分（纯函数）：源头字段只在读取时合并进行里，落库的 rows 只含自建列的值。
 */

import type { CellValue, ColumnDef, RowData } from "@tau/shared/database-types";
import {
  normalizeSourceFields,
  sourceColumnId,
  sourceEntityId,
  sourceFieldKey,
  sourceRowId,
  type SourceDef,
} from "@/features/databases/data-sources";
import type { SourceRow } from "./types";

const OPTION_COLORS = ["blue", "green", "orange", "purple", "red", "yellow", "gray"] as const;

/** 标签选项的 id 就是标签名，颜色按名称稳定取色 */
function tagOption(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return { id: name, name, color: OPTION_COLORS[Math.abs(hash) % OPTION_COLORS.length] };
}

export function collectTags(rows: readonly SourceRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows)
    for (const tag of Array.isArray(row.values.tags) ? row.values.tags : []) set.add(String(tag));
  return [...set].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

/**
 * 源头字段列按定义重建类型、只读与选项；保留用户改过的列标题、宽度与隐藏。
 * 源头字段列排在前面（按 fields 顺序），自建列保持原有相对顺序。
 */
export function sourceColumns(
  def: SourceDef,
  fields: readonly string[],
  stored: readonly ColumnDef[],
  tags: readonly string[]
): ColumnDef[] {
  const byId = new Map(stored.map(column => [column.id, column]));
  const own = normalizeSourceFields(def, fields).flatMap(key => {
    const field = def.fields.find(item => item.key === key);
    if (!field) return [];
    const id = sourceColumnId(key);
    const previous = byId.get(id);
    const column: ColumnDef = {
      id,
      title: previous?.title || field.title,
      type: field.type,
      width: previous?.width ?? (field.primary ? 280 : 160),
      ...(previous?.hidden ? { hidden: true } : {}),
      ...(field.primary ? { isPrimary: true } : {}),
      ...(field.writable ? {} : { readonly: true }),
    };
    if (field.type === "multiSelect")
      column.config = { options: tags.map(tagOption), optionIdFromName: true };
    return [column];
  });
  const custom = stored.filter(column => sourceFieldKey(column.id) === null && !column.isPrimary);
  return [...own, ...custom];
}

/** 列表里还剩哪些源头字段：删掉源头列就是取消选择该字段，主列不能删 */
export function fieldsFromColumns(def: SourceDef, columns: readonly ColumnDef[]): string[] {
  return normalizeSourceFields(
    def,
    columns.flatMap(column => {
      const key = sourceFieldKey(column.id);
      return key ? [key] : [];
    })
  );
}

/** 自建列值：只留仍存在的自建列与（无源头正文时的）行私有正文 */
function ownValues(row: RowData | undefined, columns: readonly ColumnDef[], keepDetail: boolean) {
  const result: Record<string, CellValue> = {};
  if (!row) return result;
  for (const column of columns)
    if (sourceFieldKey(column.id) === null && column.id in row) result[column.id] = row[column.id];
  if (keepDetail && row.detailContentId) result.detailContentId = row.detailContentId;
  return result;
}

export function mergeRows(
  def: SourceDef,
  sourceRows: readonly SourceRow[],
  stored: readonly RowData[],
  columns: readonly ColumnDef[]
): RowData[] {
  const storedById = new Map(stored.map(row => [row.id, row]));
  const keys = columns.flatMap(column => {
    const key = sourceFieldKey(column.id);
    return key ? [key] : [];
  });
  return sourceRows.map(source => {
    const id = sourceRowId(def.kind, source.id);
    const row: RowData = { id, ...ownValues(storedById.get(id), columns, !def.sourceBody) };
    for (const key of keys) row[sourceColumnId(key)] = source.values[key] ?? null;
    if (def.sourceBody && source.contentId) row.detailContentId = source.contentId;
    return row;
  });
}

/** 落库前的行：只留有自建值的行，去掉源头字段 */
export function storedRows(
  def: SourceDef,
  rows: readonly RowData[],
  columns: readonly ColumnDef[]
): RowData[] {
  return rows.flatMap(row => {
    const values = ownValues(row, columns, !def.sourceBody);
    return Object.keys(values).length ? [{ id: row.id, ...values }] : [];
  });
}

export interface SourceWrite {
  entityId: number;
  patch: Record<string, CellValue>;
}

export interface SplitResult {
  /** 写回源头的可写字段 */
  writes: SourceWrite[];
  /** 要在源头新建的行：临时行 id 与新行带的值（源头可写字段 + 自建列） */
  creates: { rowId: string; patch: Record<string, CellValue>; own: Record<string, CellValue> }[];
  /** 要在源头删除的实体 */
  removes: number[];
  /** 自建列的新值（按行 id），含删除后应清空的行 */
  stored: RowData[];
}

const fieldTitle = (def: SourceDef, key: string) =>
  def.fields.find(field => field.key === key)?.title ?? key;

/**
 * 把一次表格改动拆成写回源头与写自建列。只读字段被改直接抛错，由调用方整体回滚。
 * tagNames：标签列选项 id → 标签名（编辑器新建的选项 id 不是名称）。
 */
export function splitChanges(input: {
  def: SourceDef;
  columns: readonly ColumnDef[];
  stored: readonly RowData[];
  upsert: readonly RowData[];
  remove: readonly string[];
  inserted: readonly string[];
  tagNames: ReadonlyMap<string, string>;
}): SplitResult {
  const { def, columns } = input;
  const columnIds = new Set(columns.map(column => column.id));
  const removed = new Set(input.remove);
  const inserted = new Set(input.inserted);
  const removes: number[] = [];
  for (const rowId of removed) {
    const id = sourceEntityId(def.kind, rowId);
    if (id !== null) removes.push(id);
  }

  const toSource = (key: string, value: CellValue): CellValue => {
    if (key === "tags")
      return Array.isArray(value)
        ? value.map(id => input.tagNames.get(String(id)) ?? String(id))
        : [];
    if (key === "pinned") return Boolean(value);
    return value == null ? "" : value;
  };

  const partition = (row: RowData, creating = false) => {
    const patch: Record<string, CellValue> = {};
    const own: Record<string, CellValue> = {};
    for (const [field, value] of Object.entries(row)) {
      if (field === "id" || (creating && value == null)) continue;
      if (field === "detailContentId") {
        if (!def.sourceBody) own.detailContentId = value;
        continue;
      }
      if (!columnIds.has(field)) continue;
      const key = sourceFieldKey(field);
      if (key === null) {
        own[field] = value;
        continue;
      }
      const definition = def.fields.find(item => item.key === key);
      if (!definition) continue;
      if (!definition.writable)
        throw new Error(`「${fieldTitle(def, key)}」只能在${def.label}里修改`);
      patch[key] = toSource(key, value);
    }
    return { patch, own };
  };

  const writes: SourceWrite[] = [];
  const creates: SplitResult["creates"] = [];
  const ownPatches = new Map<string, Record<string, CellValue>>();
  for (const row of input.upsert) {
    if (removed.has(row.id)) continue;
    if (inserted.has(row.id)) {
      if (sourceEntityId(def.kind, row.id) !== null) throw new Error("无法恢复已删除的源条目");
      if (!def.canCreate) throw new Error(`${def.label}不支持在表里新建`);
      creates.push({ rowId: row.id, ...partition(row, true) });
      continue;
    }
    const entityId = sourceEntityId(def.kind, row.id);
    if (entityId === null) continue;
    const { patch, own } = partition(row);
    if (Object.keys(patch).length) writes.push({ entityId, patch });
    if (Object.keys(own).length) ownPatches.set(row.id, own);
  }

  const stored = input.stored
    .filter(row => !removed.has(row.id))
    .map(row => {
      const own = ownPatches.get(row.id);
      ownPatches.delete(row.id);
      return own ? { ...row, ...own } : row;
    });
  for (const [id, own] of ownPatches) stored.push({ id, ...own });
  return { writes, creates, removes, stored: storedRows(def, stored, columns) };
}

/** 标签列的选项 id → 名称 */
export function tagNameMap(columns: readonly ColumnDef[]): Map<string, string> {
  const column = columns.find(item => item.id === sourceColumnId("tags"));
  const options = (column?.config as { options?: { id: string; name: string }[] } | undefined)
    ?.options;
  return new Map((options ?? []).map(option => [option.id, option.name]));
}
