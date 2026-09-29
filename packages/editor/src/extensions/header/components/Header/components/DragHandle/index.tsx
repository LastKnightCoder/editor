import React from "react";
import { DragHandle as BlockDragHandle } from "../../../../../../components/BlockDrag";

interface DragHandleProps {
  dragRef: React.Ref<HTMLDivElement>;
  canDrag: boolean;
}

/** 标题的拖拽手柄：比通用手柄宽（1.5em），让出左侧折叠箭头的位置 */
const DragHandle: React.FC<DragHandleProps> = ({ dragRef, canDrag }) => (
  <BlockDragHandle
    dragRef={dragRef}
    canDrag={canDrag}
    className="-left-[2.7em] h-[1.5em] w-[1.5em] transition-opacity duration-200"
    iconClassName="translate-y-0"
  />
);

export default DragHandle;
