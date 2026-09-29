import { memo } from "react";
import { DragHandle as BlockDragHandle } from "../../../../components/BlockDrag";

interface DragHandleProps {
  canDrag: boolean;
  dragRef: React.Ref<HTMLDivElement>;
  onClick?: (e: React.MouseEvent) => void;
}

const DragHandle = memo<DragHandleProps>(({ canDrag, dragRef, onClick }) => (
  <BlockDragHandle dragRef={dragRef} canDrag={canDrag} onClick={onClick} />
));

DragHandle.displayName = "DragHandle";

export default DragHandle;
