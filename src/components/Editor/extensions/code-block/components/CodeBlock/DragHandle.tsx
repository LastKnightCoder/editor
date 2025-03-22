import { MdDragIndicator } from "react-icons/md";
import { memo } from "react";
import { ConnectDragSource } from "react-dnd";
import classnames from "classnames";
import styles from "./index.module.less";

// 拖拽句柄组件
interface DragHandleProps {
  canDrag: boolean;
  dragRef: ConnectDragSource;
}

const DragHandle = memo<DragHandleProps>(({ canDrag, dragRef }) => (
  <div
    className={classnames(styles.dragHandler, {
      [styles.canDrag]: canDrag,
    })}
    contentEditable={false}
    ref={dragRef}
  >
    <MdDragIndicator className={styles.icon} />
  </div>
));

DragHandle.displayName = "DragHandle";

export default DragHandle;
