import type { TableCellElement, TableElement } from "./types";

/**
 * 合并单元格的覆盖图：表格是满格矩形，合并区域由左上格（原点格）的 rowSpan / colSpan 定义，
 * 区域内其余格是被覆盖的空占位格。按行优先扫描、先占先得，对任意数据都有确定结果。
 */

export interface CellRect {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

/** 每个逻辑格所属区域的原点坐标 */
export type CoverMap = Array<Array<readonly [row: number, col: number]>>;

export const cellSpan = (
  cell: TableCellElement | undefined
): [rowSpan: number, colSpan: number] => [
  Math.max(1, Math.floor(cell?.rowSpan ?? 1) || 1),
  Math.max(1, Math.floor(cell?.colSpan ?? 1) || 1),
];

export const isMergedCell = (cell: TableCellElement | undefined) =>
  cellSpan(cell).some(span => span > 1);

export const hasMergedCells = (table: TableElement) =>
  table.children.some(row => row.children.some(isMergedCell));

export function buildCoverMap(table: TableElement): CoverMap {
  const rows = table.children.length;
  const map: Array<Array<readonly [number, number] | undefined>> = table.children.map(row =>
    Array.from({ length: row.children.length })
  );
  table.children.forEach((row, r) =>
    row.children.forEach((cell, c) => {
      if (map[r][c]) return;
      const [rowSpan, colSpan] = cellSpan(cell);
      const origin = [r, c] as const;
      for (let i = r; i < Math.min(r + rowSpan, rows); i++) {
        for (let j = c; j < Math.min(c + colSpan, map[i].length); j++) {
          if (!map[i][j]) map[i][j] = origin;
        }
      }
    })
  );
  return map as CoverMap;
}

export const isOriginCell = (map: CoverMap, row: number, col: number) => {
  const origin = map[row]?.[col];
  return !!origin && origin[0] === row && origin[1] === col;
};

/** 原点格 (row, col) 实际生效的区域（跨度被越界 / 重叠截断后） */
export function regionOfOrigin(map: CoverMap, row: number, col: number): CellRect {
  let rowEnd = row;
  let colEnd = col;
  const owns = (r: number, c: number) => map[r]?.[c]?.[0] === row && map[r]?.[c]?.[1] === col;
  while (owns(rowEnd + 1, col)) rowEnd++;
  while (owns(row, colEnd + 1)) colEnd++;
  return { rowStart: row, rowEnd, colStart: col, colEnd };
}

/** 逻辑格 (row, col) 所在的区域 */
export function regionAt(map: CoverMap, row: number, col: number): CellRect {
  const [originRow, originCol] = map[row]?.[col] ?? [row, col];
  return regionOfOrigin(map, originRow, originCol);
}

/** 矩形碰到区域的一部分就扩到包住整块，迭代到稳定 */
export function expandToRegions(map: CoverMap, rect: CellRect): CellRect {
  const next = { ...rect };
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = next.rowStart; r <= next.rowEnd; r++) {
      for (let c = next.colStart; c <= next.colEnd; c++) {
        const region = regionAt(map, r, c);
        if (
          region.rowStart < next.rowStart ||
          region.colStart < next.colStart ||
          region.rowEnd > next.rowEnd ||
          region.colEnd > next.colEnd
        ) {
          next.rowStart = Math.min(next.rowStart, region.rowStart);
          next.colStart = Math.min(next.colStart, region.colStart);
          next.rowEnd = Math.max(next.rowEnd, region.rowEnd);
          next.colEnd = Math.max(next.colEnd, region.colEnd);
          changed = true;
        }
      }
    }
  }
  return next;
}

/** 矩形内的原点格坐标，按阅读顺序 */
export function originsIn(map: CoverMap, rect: CellRect): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let r = rect.rowStart; r <= rect.rowEnd; r++) {
    for (let c = rect.colStart; c <= rect.colEnd; c++) {
      if (isOriginCell(map, r, c)) result.push([r, c]);
    }
  }
  return result;
}

/** 与矩形相交的区域原点，去重但不扩张矩形 */
export function originsIntersecting(map: CoverMap, rect: CellRect): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (let r = rect.rowStart; r <= rect.rowEnd; r++) {
    for (let c = rect.colStart; c <= rect.colEnd; c++) {
      const origin = map[r]?.[c];
      if (!origin) continue;
      const key = `${origin[0]}:${origin[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push([origin[0], origin[1]]);
    }
  }
  return result;
}

/** 区域在某一维上跨过下标 index 与 index+1 之间的边界（即边界落在区域内部） */
export function regionsCrossing(map: CoverMap, axis: "row" | "col", boundary: number): CellRect[] {
  const result: CellRect[] = [];
  map.forEach((cells, r) =>
    cells.forEach((_, c) => {
      if (!isOriginCell(map, r, c)) return;
      const region = regionOfOrigin(map, r, c);
      const [start, end] =
        axis === "row" ? [region.rowStart, region.rowEnd] : [region.colStart, region.colEnd];
      if (start < boundary && boundary <= end) result.push(region);
    })
  );
  return result;
}

export const sameRect = (left: CellRect, right: CellRect) =>
  left.rowStart === right.rowStart &&
  left.rowEnd === right.rowEnd &&
  left.colStart === right.colStart &&
  left.colEnd === right.colEnd;
