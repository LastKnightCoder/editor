import React from "react";
import { RenderElementProps } from "slate-react";
import type { TableRowElement } from "../../types";
import { cn } from "@tau/ui";

import useDragAndDrop from "./useDragAndDrop";
import { BLOCK_DRAG_GROUP } from "@tau/editor/api";
import { TableRowDragContext } from "./dragContext";

interface ITableRowProps {
  attributes: RenderElementProps["attributes"];
  element: TableRowElement;
}

const TableRow: React.FC<React.PropsWithChildren<ITableRowProps>> = props => {
  const { attributes, children, element } = props;

  const { drag, drop, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });
  const dropActive = isOverCurrent && canDrop;

  const { ref } = attributes;

  return (
    <tr
      {...attributes}
      ref={node => {
        ref(node);
        drop(node);
      }}
      // tr 里放不了插入线元素，放置位置用行的上 / 下虚线边表示
      className={cn(
        "relative",
        BLOCK_DRAG_GROUP,
        dropActive &&
          (isBefore
            ? "border-t-2 border-dashed border-t-[var(--ed-accent-soft)]"
            : "border-b-2 border-dashed border-b-[var(--ed-accent-soft)]")
      )}
    >
      <TableRowDragContext.Provider
        value={{
          firstCell: element.children[0],
          canDrag,
          dragRef: node => {
            drag(node);
          },
        }}
      >
        {children}
      </TableRowDragContext.Provider>
    </tr>
  );
};

export default TableRow;
