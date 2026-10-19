/** 表格行列在定位容器内的像素边界（手柄、插入线、格选区覆盖层共用） */
export interface TableGeometry {
  rows: Array<{ top: number; bottom: number }>;
  cols: Array<{ left: number; right: number }>;
  width: number;
  height: number;
}

export function measureTable(
  container: HTMLElement | null,
  table: HTMLTableElement | null
): TableGeometry | null {
  const firstRow = table?.rows[0];
  if (!container || !table || !firstRow) return null;
  const base = container.getBoundingClientRect();
  const rows = Array.from(table.rows, tr => {
    const rect = tr.getBoundingClientRect();
    return { top: rect.top - base.top, bottom: rect.bottom - base.top };
  });
  const cols = Array.from(firstRow.cells, td => {
    const rect = td.getBoundingClientRect();
    return { left: rect.left - base.left, right: rect.right - base.left };
  });
  if (!cols.length) return null;
  return { rows, cols, width: cols[cols.length - 1].right, height: rows[rows.length - 1].bottom };
}

/** 指针坐标落在第几条边界（0..n），用于拖动排序的放置位置 */
export const boundaryAt = (spans: Array<{ start: number; end: number }>, position: number) =>
  spans.filter(span => (span.start + span.end) / 2 < position).length;
