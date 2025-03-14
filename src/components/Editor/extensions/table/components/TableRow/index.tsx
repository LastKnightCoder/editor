import React from "react";
import { RenderElementProps } from "slate-react";
import { TableRowElement } from "@/components/Editor/types";

import useDragAndDrop from "./useDragAndDrop.ts";
import classnames from "classnames";
import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";

interface ITableRowProps {
  attributes: RenderElementProps["attributes"];
  element: TableRowElement;
}

const TableRow: React.FC<React.PropsWithChildren<ITableRowProps>> = (props) => {
  const { attributes, children, element } = props;

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  const { ref } = attributes;

  return (
    <tr
      {...attributes}
      ref={(node) => {
        ref(node);
        drop(node);
      }}
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      {children}
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
    </tr>
  );
};

export default TableRow;
