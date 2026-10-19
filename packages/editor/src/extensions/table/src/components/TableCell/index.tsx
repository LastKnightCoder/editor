import React, { useContext } from "react";
import type { RenderElementProps } from "slate-react";

import type { TableCellElement } from "../../types";
import { TableAlignContext, TableRowContext } from "../context";

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
  const textAlign = align?.[row?.children.indexOf(element) ?? -1] ?? undefined;

  return (
    <td {...attributes} style={textAlign ? { textAlign } : undefined}>
      {children}
    </td>
  );
};

export default TableCell;
