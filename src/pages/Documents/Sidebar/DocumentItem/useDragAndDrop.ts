import { useState, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";

export const type = 'sidebar-document-item';

export interface IDragItem {
  itemId: number;
  parentId: number;
  isRoot: boolean;
  path: number[];
}

type IDragAndDropParams = IDragItem & {
  onDragEnd: (dragItem: IDragItem) => void;
  onDrop: (dragItem: IDragItem, dragPosition: EDragPosition) => void;
}

export enum EDragPosition {
  Top = 'top',
  Bottom = 'bottom',
  Inside = 'inside'
}

const useDragAndDrop = (item: IDragAndDropParams) => {
  const { itemId, path, onDragEnd, onDrop } = item;
  const [dragPosition, setDragPosition] = useState<EDragPosition>(EDragPosition.Inside);
  const dropContainerRef = useRef<HTMLDivElement | null>(null);

  const [{ isDragging }, drag] = useDrag<IDragItem, IDragItem & { dragPosition: EDragPosition }, {
    isDragging: boolean;
  }>(() => ({
    type,
    item,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      if (!monitor.didDrop()) {
        return;
      }
      const dropResult = monitor.getDropResult();
      if (!dropResult) return;
      console.log('dropResult', dropResult, item, dragPosition);
      if (item.parentId === dropResult.parentId && dropResult.dragPosition !== EDragPosition.Inside) {
        return;
      }
      onDragEnd(item);
    }
  }), [item]);

  const [{ isOver, canDrop }, drop] = useDrop<IDragItem, IDragItem, {
    isOver: boolean;
    canDrop: boolean;
  }>({
    accept: type,
    hover: (_item, monitor) => {
      const dragClientOffset = monitor.getClientOffset();
      if (!dragClientOffset) {
        return;
      }
      const dropContainer = dropContainerRef.current;
      if (!dropContainer) {
        return;
      }
      const dropContainerRect = dropContainer.getBoundingClientRect();
      // 在上面 10 px 以内，就是 top，在下面 10 px 以内，就是 bottom，否则就是 inside
      if (dragClientOffset.y - dropContainerRect.top < 10) {
        setDragPosition(EDragPosition.Top);
      } else if (dropContainerRect.bottom - dragClientOffset.y < 10) {
        setDragPosition(EDragPosition.Bottom);
      } else {
        setDragPosition(EDragPosition.Inside);
      }
    },
    canDrop: (dragItem) => {
      const dragPath = dragItem.path;
      const dropPath = path;
      console.log('canDrop', dragPath, dropPath);
      if (dragItem.itemId === itemId) {
        return false;
      }
      // 已经在里面了，不允许
      if (dragPosition === EDragPosition.Inside && dragItem.parentId === itemId) {
        return false;
      }
      // dropPath 是 dragPath 的子路径，不允许
      if (dropPath.length > dragPath.length) {
        for (let i = 0; i < dragPath.length; i++) {
          if (dragPath[i] !== dropPath[i]) {
            return true;
          }
        }
        return false;
      }
      return true;
    },
    drop: (dragItem, monitor) => {
      if (monitor.didDrop()) {
        return;
      }
      onDrop(dragItem, dragPosition);
      return {
        ...item,
        dragPosition,
      };
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    })
  }, [item]);

  return {
    drag,
    drop,
    isDragging,
    isOver,
    dragPosition,
    dropContainerRef,
    canDrop,
  }
}

export default useDragAndDrop;