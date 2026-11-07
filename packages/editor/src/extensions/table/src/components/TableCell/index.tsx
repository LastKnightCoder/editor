import React, { useContext } from "react";
import type { RenderElementProps } from "slate-react";

import type { TableCellElement } from "../../types";
import { cellSpan, regionOfOrigin } from "../../span";
import { TableAlignContext, TableCoverContext, TableRowContext } from "../context";

interface ITableCellProps {
  attributes: RenderElementProps["attributes"];
  element: TableCellElement;
}

const TableCell: React.FC<React.PropsWithChildren<ITableCellProps>> = ({
  attributes,
  element,
  children,
}) => {
  const align = useContext(TableAlignContext);
  const row = useContext(TableRowContext);
  const cover = useContext(TableCoverContext);
  const col = row?.children.indexOf(element) ?? -1;
  const rowIndex = row ? cover?.rowIndex.get(row) : undefined;
  const textAlign = align?.[col] ?? undefined;

  if (cover && rowIndex !== undefined && col >= 0) {
    const [originRow, originCol] = cover.map[rowIndex]?.[col] ?? [rowIndex, col];
    // 被覆盖格保留 Slate 节点与路径，只是不显示、不可编辑
    if (originRow !== rowIndex || originCol !== col) {
      return (
        <td {...attributes} hidden contentEditable={false}>
          {children}
        </td>
      );
    }
    const region = regionOfOrigin(cover.map, rowIndex, col);
    const [rowSpan, colSpan] = [
      region.rowEnd - region.rowStart + 1,
      region.colEnd - region.colStart + 1,
    ];
    return (
      <td
        {...attributes}
        rowSpan={rowSpan > 1 ? rowSpan : undefined}
        colSpan={colSpan > 1 ? colSpan : undefined}
        data-edge-right={region.colEnd === cover.cols - 1 || undefined}
        data-edge-bottom={region.rowEnd === cover.rows - 1 || undefined}
        style={textAlign ? { textAlign } : undefined}
      >
        {children}
      </td>
    );
  }

  const [rowSpan, colSpan] = cellSpan(element);
  return (
    <td
      {...attributes}
      rowSpan={rowSpan > 1 ? rowSpan : undefined}
      colSpan={colSpan > 1 ? colSpan : undefined}
      style={textAlign ? { textAlign } : undefined}
    >
      {children}
    </td>
  );
};

export default TableCell;
