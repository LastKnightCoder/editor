import { Element, Node, type Descendant } from "slate";
import type { CellValue, ColumnDef, RowData } from "../../types";
import type { ImageItem } from "../../plugins/ImagePlugin/types";
import type PluginManager from "../../PluginManager";

/** 未填、空串、空数组视为空；0 与 false 是有效值 */
export function isEmptyCellValue(value: CellValue | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * 可折叠的空属性：只折叠「点开才能填」的字段（有 Editor 的插件）；
 * 星级、勾选、图片这类渲染器本身就是输入控件的字段始终展示。
 */
export function isFoldableEmpty(
  column: ColumnDef,
  value: CellValue | undefined,
  pluginManager: PluginManager
): boolean {
  const plugin = pluginManager.getPlugin(column.type);
  return Boolean(plugin?.editable && plugin.Editor) && isEmptyCellValue(value);
}

/** 打开 / 切换到某行时哪些属性该折叠（此后填空的字段不会因再次清空而跳走） */
export function collectFoldedColumnIds(
  row: RowData,
  columns: readonly ColumnDef[],
  pluginManager: PluginManager
): Set<string> {
  return new Set(
    columns
      .filter(column => isFoldableEmpty(column, row[column.id], pluginManager))
      .map(column => column.id)
  );
}

/** 按视图列序排列可见列；不在列序里的列排在末尾 */
export function orderVisibleColumns(
  columns: readonly ColumnDef[],
  columnOrder: readonly string[]
): ColumnDef[] {
  const orderIndex = new Map(columnOrder.map((id, index) => [id, index]));
  return columns
    .filter(column => !column.hidden)
    .sort(
      (a, b) =>
        (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
}

/** rowIds 是当前视图投影后的可见行序；当前行不在其中（被筛选掉）时没有相邻行 */
export function neighborRowIds(rowIds: readonly string[], rowId: string) {
  const index = rowIds.indexOf(rowId);
  return {
    index,
    prev: index > 0 ? rowIds[index - 1] : null,
    next: index >= 0 && index < rowIds.length - 1 ? rowIds[index + 1] : null,
  };
}

/** 封面取第一个有图的图片列 */
export function coverImagesOf(row: RowData, columns: readonly ColumnDef[]): ImageItem[] {
  for (const column of columns) {
    if (column.type !== "image") continue;
    const value = row[column.id];
    if (Array.isArray(value) && value.length > 0) return value as ImageItem[];
  }
  return [];
}

/** 只含空段落的正文视为没写 */
export function isBlankDocument(value: readonly Descendant[]): boolean {
  return value.every(
    node =>
      Element.isElement(node) &&
      (node as { type?: string }).type === "paragraph" &&
      Node.string(node) === ""
  );
}
