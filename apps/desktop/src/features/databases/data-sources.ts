/**
 * 数据库可关联的应用内数据源：每个源的字段清单与能力。纯数据，主进程与渲染端共用。
 * 源头字段在表里的列 id 固定为 `src:<key>`，行 id 为 `<kind>:<实体 id>`。
 */

import type { DataTableSourceKind, DataTableSourceScope } from "@tau/shared/database-types";

export interface SourceFieldDef {
  key: string;
  title: string;
  /** 列类型：text / multiSelect / checkbox / date / number */
  type: string;
  /** 能在表里改、改了写回源头 */
  writable: boolean;
  /** 新建弹窗里默认勾选 */
  defaultOn: boolean;
  /** 主列：必选，行详情从这里打开 */
  primary?: boolean;
}

export interface SourceDef {
  kind: DataTableSourceKind;
  label: string;
  /** 一行指的是什么，用于删除确认与提示 */
  unit: string;
  fields: SourceFieldDef[];
  canCreate: boolean;
  /** 行详情的正文就是源头正文 */
  sourceBody: boolean;
  defaultScope: DataTableSourceScope;
}

const created = { key: "created", title: "创建时间", type: "date", writable: false };
const updated = { key: "updated", title: "更新时间", type: "date", writable: false };
const words = { key: "words", title: "字数", type: "number", writable: false };
const tags = { key: "tags", title: "标签", type: "multiSelect", writable: true, defaultOn: true };

export const DATA_SOURCES: readonly SourceDef[] = [
  {
    kind: "card",
    label: "卡片",
    unit: "卡片",
    canCreate: true,
    sourceBody: true,
    defaultScope: { tags: [] },
    fields: [
      {
        key: "title",
        title: "开头",
        type: "text",
        writable: false,
        defaultOn: true,
        primary: true,
      },
      tags,
      { key: "pinned", title: "置顶", type: "checkbox", writable: true, defaultOn: false },
      { ...created, defaultOn: true },
      { ...updated, defaultOn: false },
      { ...words, defaultOn: false },
    ],
  },
  {
    kind: "article",
    label: "文章",
    unit: "文章",
    canCreate: true,
    sourceBody: true,
    defaultScope: { tags: [] },
    fields: [
      { key: "title", title: "标题", type: "text", writable: true, defaultOn: true, primary: true },
      { key: "author", title: "作者", type: "text", writable: false, defaultOn: false },
      tags,
      { key: "pinned", title: "置顶", type: "checkbox", writable: true, defaultOn: false },
      { ...created, defaultOn: true },
      { ...updated, defaultOn: false },
      { ...words, defaultOn: true },
    ],
  },
  {
    kind: "document",
    label: "项目文档",
    unit: "文档",
    canCreate: true,
    sourceBody: true,
    defaultScope: { deep: true },
    fields: [
      { key: "title", title: "标题", type: "text", writable: true, defaultOn: true, primary: true },
      { key: "parent", title: "上级", type: "text", writable: false, defaultOn: true },
      tags,
      { ...created, defaultOn: false },
      { ...updated, defaultOn: true },
      { ...words, defaultOn: true },
    ],
  },
  {
    kind: "diary",
    label: "日记",
    unit: "日记",
    canCreate: false,
    sourceBody: false,
    defaultScope: { range: "month" },
    fields: [
      { key: "day", title: "日期", type: "text", writable: false, defaultOn: true, primary: true },
      { key: "date", title: "记录日", type: "date", writable: false, defaultOn: false },
      { key: "weather", title: "天气", type: "text", writable: false, defaultOn: true },
      { key: "mood", title: "心情", type: "text", writable: false, defaultOn: true },
      { ...tags, writable: false },
      { ...words, defaultOn: true },
    ],
  },
];

export const SOURCE_COLUMN_PREFIX = "src:";

export const sourceColumnId = (key: string) => `${SOURCE_COLUMN_PREFIX}${key}`;

export const sourceFieldKey = (columnId: string) =>
  columnId.startsWith(SOURCE_COLUMN_PREFIX) ? columnId.slice(SOURCE_COLUMN_PREFIX.length) : null;

export function sourceDef(kind: string): SourceDef | undefined {
  return DATA_SOURCES.find(source => source.kind === kind);
}

/** 已知 kind 的定义（kind 来自类型约束或已校验的记录） */
export function requireSourceDef(kind: DataTableSourceKind): SourceDef {
  const def = sourceDef(kind);
  if (!def) throw new Error(`不支持的数据源：${kind}`);
  return def;
}

export const sourceRowId = (kind: DataTableSourceKind, id: number) => `${kind}:${id}`;

/** 行 id 解析为源头实体 id；不是本源的行返回 null */
export function sourceEntityId(kind: DataTableSourceKind, rowId: string): number | null {
  const prefix = `${kind}:`;
  if (!rowId.startsWith(prefix)) return null;
  const id = Number(rowId.slice(prefix.length));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** 主列必选；未知字段丢弃；保持清单顺序 */
export function normalizeSourceFields(def: SourceDef, fields: readonly string[]): string[] {
  const chosen = new Set(fields);
  return def.fields.filter(field => field.primary || chosen.has(field.key)).map(field => field.key);
}
