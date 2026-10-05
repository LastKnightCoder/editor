import React from "react";
import type { RenderElementProps } from "slate-react";

import type { TableRowElement } from "../../types";
import { TableRowContext } from "../context";

interface ITableRowProps {
  attributes: RenderElementProps["attributes"];
  element: TableRowElement;
}

const TableRow: React.FC<React.PropsWithChildren<ITableRowProps>> = ({
  attributes,
  element,
  children,
}) => (
  <tr {...attributes}>
    <TableRowContext.Provider value={element}>{children}</TableRowContext.Provider>
  </tr>
);

export default TableRow;
