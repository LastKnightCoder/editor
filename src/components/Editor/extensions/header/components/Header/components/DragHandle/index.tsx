import React from "react";
import { MdDragIndicator } from "react-icons/md";
import classnames from "classnames";
import styles from "../../index.module.less";
import { ConnectDragSource } from "react-dnd";

interface DragHandleProps {
  dragRef: ConnectDragSource;
  canDrag: boolean;
}

const DragHandle: React.FC<DragHandleProps> = ({ dragRef, canDrag }) => {
  return (
    <div
      contentEditable={false}
      ref={dragRef}
      className={classnames(styles.dragHandler, {
        [styles.canDrag]: canDrag,
      })}
    >
      <MdDragIndicator className={styles.icon} />
    </div>
  );
};

export default DragHandle;
