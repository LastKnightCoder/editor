import type { Snapshot } from "./snapshots";

/** 排序和落库时间不改变业务状态；撤销仍保留完整行。 */
export function semanticSnapshot(snapshot: Snapshot): Snapshot {
  const ignored = new Set(["update_time", "sort_index", "order_index"]);
  return Object.fromEntries(
    Object.entries(snapshot).map(([table, rows]) => [
      table,
      rows.map(row =>
        Object.fromEntries(Object.entries(row).filter(([field]) => !ignored.has(field)))
      ),
    ])
  );
}
