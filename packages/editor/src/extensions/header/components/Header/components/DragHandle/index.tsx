import React from "react";
import { MdDragIndicator } from "react-icons/md";
import classnames from "classnames";
import styles from "../../index.module.less";

interface DragHandleProps {
  dragRef: React.Ref<HTMLDivElement>;
  canDrag: boolean;
}

const DragHandle: React.FC<DragHandleProps> = ({ dragRef, canDrag }) => {
  return (
    <div
      contentEditable={false}
      ref={dragRef}
      className={classnames(styles.headerDragHandle, {
        [styles.canDrag]: canDrag,
      })}
    >
      <MdDragIndicator className={styles.icon} />
    </div>
  );
};

export default DragHandle;
