import { MdDragIndicator } from "react-icons/md";
import { memo } from "react";
import classnames from "classnames";
import styles from "./index.module.less";

// 拖拽句柄组件
interface DragHandleProps {
  canDrag: boolean;
  dragRef: React.Ref<HTMLDivElement>;
  onClick?: (e: React.MouseEvent) => void;
}

const DragHandle = memo<DragHandleProps>(({ canDrag, dragRef, onClick }) => (
  <div
    className={classnames(styles.dragHandler, {
      [styles.canDrag]: canDrag,
    })}
    contentEditable={false}
    ref={dragRef}
    onClick={onClick}
  >
    <MdDragIndicator className={styles.icon} />
  </div>
));

DragHandle.displayName = "DragHandle";

export default DragHandle;
