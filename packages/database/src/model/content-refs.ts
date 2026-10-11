/**
 * 数据表正文引用的收集与差集（D-129 / D-130）。
 *
 * 纯函数零依赖：按字段 model 的 contentRefs 声明统计数据表单元格引用的正文，
 * 按出现次数计数（同一 id 出现 N 次计 N 份）。行级正文引用（如数据表持久化行
 * 挂的正文 id）属持久化语义，由调用方自行并入。主进程数据表写路径在同一事务
 * 内对比新旧引用，新增 retain、减少 releaseDeferred。
 */

import type { ColumnDef, RowData } from "../types";
import type { DatabaseFieldModel } from "./field-model";

/**
 * 消费方按未知列 config 统一收窄的 model 形态：内置 model 各自按列 config 成型，
 * 泛型天然不可赋给 DatabaseFieldModel<unknown>，而消费侧按 type 匹配后传入的
 * 就是任意列（与 field-model.test 的收窄口径一致）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConfigFieldModel = DatabaseFieldModel<any>;

/** 字段 model 登记的输入形态：已按 type 建好的映射，或待按 type 索引的 model 数组 */
export type FieldModelRegistry =
  ReadonlyMap<string, AnyConfigFieldModel> | readonly AnyConfigFieldModel[];

export function toFieldModelMap(
  models: FieldModelRegistry
): ReadonlyMap<string, AnyConfigFieldModel> {
  if ("get" in models) return models;
  return new Map(models.map(model => [model.type, model]));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * 统计数据表单元格引用的正文：声明了 contentRefs 的字段按各 model 收集，
 * 按出现次数计（多重集合）；model 返回的非法值（非正整数）忽略。
 * 收集口径由字段 model 声明（D-129 / D-130）。
 */
export function collectContentRefs(
  columns: readonly ColumnDef[] | null | undefined,
  rows: readonly RowData[] | null | undefined,
  models: FieldModelRegistry
): Map<number, number> {
  const refs = new Map<number, number>();
  if (!Array.isArray(columns) || !Array.isArray(rows)) return refs;

  const registry = toFieldModelMap(models);
  const count = (contentId: number) => refs.set(contentId, (refs.get(contentId) ?? 0) + 1);

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const countedColumns = new Set<string>();
    for (const column of columns) {
      if (!column || countedColumns.has(column.id)) continue;
      const contentRefs = registry.get(column.type)?.contentRefs;
      if (!contentRefs) continue;
      countedColumns.add(column.id);
      const ids = contentRefs((row as Record<string, unknown>)[column.id], column);
      for (const contentId of ids) {
        if (isPositiveInteger(contentId)) count(contentId);
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
