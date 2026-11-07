import { regionAt, type CoverMap } from "../../span";

/** 表格行列在定位容器内的像素边界（手柄、插入线、格选区覆盖层共用） */
export interface TableGeometry {
  rows: Array<{ top: number; bottom: number }>;
  cols: Array<{ left: number; right: number }>;
  width: number;
  height: number;
}

/**
 * 行边界取 tr；列边界取该列任意一个不跨列的可见格。整列都被跨列格占据时，
 * 按最窄的跨列格宽度均分（列宽在该处不可观测）。
 */
export function measureTable(
  container: HTMLElement | null,
  table: HTMLTableElement | null,
  map: CoverMap
): TableGeometry | null {
  const rowCount = map.length;
  const colCount = map[0]?.length ?? 0;
  if (!container || !table || !rowCount || !colCount || table.rows.length !== rowCount) return null;
  const base = container.getBoundingClientRect();
  const rows = Array.from(table.rows, tr => {
    const rect = tr.getBoundingClientRect();
    return { top: rect.top - base.top, bottom: rect.bottom - base.top };
  });
  const cellRect = (row: number, col: number) =>
    (table.rows[row]?.children[col] as HTMLElement | undefined)?.getBoundingClientRect();
  const cols = Array.from({ length: colCount }, (_, col) => {
    let best: { left: number; right: number; share: number } | undefined;
    for (let row = 0; row < rowCount; row++) {
      const region = regionAt(map, row, col);
      const share = region.colEnd - region.colStart + 1;
      if (best && best.share <= share) continue;
      const rect = cellRect(region.rowStart, region.colStart);
      if (!rect) continue;
      const width = rect.width / share;
      const left = rect.left + width * (col - region.colStart);
      best = { left, right: left + width, share };
      if (share === 1) break;
    }
    return best
      ? { left: best.left - base.left, right: best.right - base.left }
      : { left: 0, right: 0 };
  });
  return { rows, cols, width: cols[cols.length - 1].right, height: rows[rows.length - 1].bottom };
}

/** 指针坐标落在第几条边界（0..n），用于拖动排序的放置位置 */
export const boundaryAt = (spans: Array<{ start: number; end: number }>, position: number) =>
  spans.filter(span => (span.start + span.end) / 2 < position).length;

/** 指针坐标落在第几个区间内（0..n-1），用于把悬停位置换成逻辑行列 */
export const spanIndexAt = (spans: Array<{ start: number; end: number }>, position: number) => {
  const index = spans.findIndex(span => position < span.end);
  return index === -1 ? spans.length - 1 : index;
};
