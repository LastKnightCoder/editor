import React, { useContext } from "react";
import { DragHandle } from "@tau/editor/api";
import { TableRowDragContext } from "../TableRow/dragContext";
import { RenderElementProps } from "slate-react";

import type { TableCellElement } from "../../types";

interface ITableCellProps {
  attributes: RenderElementProps["attributes"];
  element: TableCellElement;
}

const TableCell: React.FC<React.PropsWithChildren<ITableCellProps>> = props => {
  const { attributes, children, element } = props;
  const rowDrag = useContext(TableRowDragContext);

  return (
    <td {...attributes}>
      {children}
      {rowDrag?.firstCell === element && (
        <DragHandle dragRef={rowDrag.dragRef} canDrag={rowDrag.canDrag} />
      )}
    </td>
  );
};

export default TableCell;
