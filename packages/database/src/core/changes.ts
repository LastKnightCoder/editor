import type { RowChanges, RowData } from "../types";

/** 快照入口和保存事件都使用同一字段差量协议。 */
export function diffRows(before: RowData[], after: RowData[]): RowChanges {
  if (before === after) return { upsert: [], remove: [] };
  const previous = new Map(before.map(row => [row.id, row]));
  const upsert: RowData[] = [];
  for (const row of after) {
    const old = previous.get(row.id);
    previous.delete(row.id);
    if (!old) {
      upsert.push(row);
      continue;
    }
    if (old === row) continue;
    const patch: RowData = { id: row.id };
    for (const key of new Set([...Object.keys(old), ...Object.keys(row)])) {
      if (key !== "id" && JSON.stringify(old[key]) !== JSON.stringify(row[key]))
        patch[key] = row[key];
    }
    if (Object.keys(patch).length > 1) upsert.push(patch);
  }
  return { upsert, remove: [...previous.keys()] };
}

export function applyRowChanges(rows: RowData[], changes: RowChanges): RowData[] {
  const removed = new Set(changes.remove);
  const patches = new Map(changes.upsert.map(row => [row.id, row]));
  const next = rows
    .filter(row => !removed.has(row.id))
    .map(row => {
      const patch = patches.get(row.id);
      patches.delete(row.id);
      return patch ? { ...row, ...patch } : row;
    });
  return [...next, ...patches.values()];
}
