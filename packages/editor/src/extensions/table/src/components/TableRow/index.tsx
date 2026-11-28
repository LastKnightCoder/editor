import React, { useContext } from "react";
import type { RenderElementProps } from "slate-react";
import { inlineRowTint } from "@tau/editor/extensions/text-formatting/palette";

import type { TableRowElement } from "../../types";
import { TableCoverContext, TableRowContext, TableRowTintPreviewContext } from "../context";

interface ITableRowProps {
  attributes: RenderElementProps["attributes"];
  element: TableRowElement;
}

const TableRow: React.FC<React.PropsWithChildren<ITableRowProps>> = ({
  attributes,
  element,
  children,
}) => {
  const preview = useContext(TableRowTintPreviewContext);
  const cover = useContext(TableCoverContext);
  const index = cover?.rowIndex.get(element);
  const previewing =
    preview !== null && index !== undefined && index >= preview.from && index <= preview.to;
  const color = previewing ? preview.color : element.color;
  const tint = inlineRowTint(color);
  return (
    // 底色交给格去画（表格用 border-separate，tr 底色会被表头格的底色盖住）
    <tr
      {...attributes}
      data-color={tint ? (color ?? undefined) : undefined}
      style={tint ? ({ "--ed-table-row-tint": tint } as React.CSSProperties) : undefined}
    >
      <TableRowContext.Provider value={element}>{children}</TableRowContext.Provider>
    </tr>
  );
};

export default TableRow;
