/**
 * 数据表正文引用的收集与差集（D-129）。
 *
 * 纯函数零依赖：统计数据表当前 columns/rows 引用的正文——rich-text 单元格的
 * contentId 与行 detailContentId——按出现次数计数（同一 id 出现 N 次计 N 份）。
 * 主进程数据表写路径在同一事务内对比新旧引用，新增 retain、减少 releaseDeferred。
 */

import type { ColumnDef, RowData } from "./database-types";

/** 富文本字段类型：单元格值是数组，每项携带 contentId */
export const RICH_TEXT_FIELD_TYPE = "rich-text";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** 统计数据表引用的正文：rich-text 单元格 contentId 与行 detailContentId，按出现次数计（D-129） */
export function collectDataTableContentRefs(
  columns: ColumnDef[] | null | undefined,
  rows: RowData[] | null | undefined
): Map<number, number> {
  const refs = new Map<number, number>();
  if (!Array.isArray(columns) || !Array.isArray(rows)) return refs;

  const richTextColumnIds = new Set(
    columns.filter(column => column && column.type === RICH_TEXT_FIELD_TYPE).map(c => c.id)
  );
  const count = (contentId: number) => refs.set(contentId, (refs.get(contentId) ?? 0) + 1);

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (isPositiveInteger(row.detailContentId)) count(row.detailContentId);
    for (const columnId of richTextColumnIds) {
      const cell = (row as Record<string, unknown>)[columnId];
      if (!Array.isArray(cell)) continue;
      for (const item of cell) {
        if (item && isPositiveInteger((item as { contentId?: unknown }).contentId)) {
          count((item as { contentId: number }).contentId);
        }
      }
    }
  }
  return refs;
}

/** 新旧引用的差：retain/release 中同一 id 按差值重复出现 */
export function diffContentRefs(
  before: Map<number, number>,
  after: Map<number, number>
): { retain: number[]; release: number[] } {
  const retain: number[] = [];
  const release: number[] = [];
  for (const [contentId, afterCount] of after) {
    const delta = afterCount - (before.get(contentId) ?? 0);
    for (let i = 0; i < delta; i++) retain.push(contentId);
  }
  for (const [contentId, beforeCount] of before) {
    const delta = beforeCount - (after.get(contentId) ?? 0);
    for (let i = 0; i < delta; i++) release.push(contentId);
  }
  return { retain, release };
}
