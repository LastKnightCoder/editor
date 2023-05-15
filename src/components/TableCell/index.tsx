import React from "react";
import {RenderElementProps} from "slate-react";
import {TableCellElement} from "../../custom-types";

interface ITableCellProps {
  attributes: RenderElementProps['attributes'];
  element: TableCellElement;
}

const TableCell: React.FC<React.PropsWithChildren<ITableCellProps>> = (props) => {
  const { attributes, children } = props;

  return (
    <td {...attributes} className="table">
      {children}
    </td>
  )
}

export default TableCell;
