import React from "react";
import { RenderElementProps } from "slate-react";
import { TableRowElement } from "@/components/Editor/types";

interface ITableRowProps {
  attributes: RenderElementProps['attributes'];
  element: TableRowElement;
}

const TableRow: React.FC<React.PropsWithChildren<ITableRowProps>> = (props) => {
  const { attributes, children } = props;

  return (
    <tr {...attributes} className="table">
      {children}
    </tr>
  )
}

export default TableRow;
