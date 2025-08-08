import { useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";

export const DND_TYPE = "whiteboard-element";

export type DragItem = {
  elementId: string;
  path: number[];
  parentPath: number[] | null;
};

export enum DragPosition {
  Top = "top",
  Bottom = "bottom",
  Inside = "inside",
}

export const useElementDnD = (
  item: DragItem,
  opts: {
    onDrop?: (
      dragItem: DragItem,
      dropItem: DragItem,
      position: DragPosition,
    ) => void;
    onEnd?: (dragItem: DragItem) => void;
    canDropExtra?: (
      dragItem: DragItem,
      dropItem: DragItem,
      position: DragPosition,
    ) => boolean;
  } = {},
) => {
  const { onDrop, onEnd, canDropExtra } = opts;
  const [dragPosition, setDragPosition] = useState<DragPosition>(
    DragPosition.Inside,
  );
  const dropContainerRef = useRef<HTMLDivElement | null>(null);

  const [{ isDragging }, drag] = useDrag<
    DragItem,
    DragItem,
    { isDragging: boolean }
  >(
    () => ({
      type: DND_TYPE,
      item,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
      end: (dragItem, monitor) => {
        if (!monitor.didDrop()) return;
        onEnd?.(dragItem);
      },
    }),
    [item],
  );

  const [{ isOver, canDrop }, drop] = useDrop<
    DragItem,
    DragItem,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: DND_TYPE,
      hover: (_dragItem, monitor) => {
        const client = monitor.getClientOffset();
        const el = dropContainerRef.current;
        if (!client || !el) return;
        const rect = el.getBoundingClientRect();
        if (client.y - rect.top < 10) setDragPosition(DragPosition.Top);
        else if (rect.bottom - client.y < 10)
          setDragPosition(DragPosition.Bottom);
        else setDragPosition(DragPosition.Inside);
      },
      canDrop: (dragItem) => {
        // 不允许拖到自身
        if (dragItem.elementId === item.elementId) return false;
        // 不允许拖到自己的子孙
        const dragPath = dragItem.path;
        const dropPath = item.path;
        if (dropPath.length > dragPath.length) {
          for (let i = 0; i < dragPath.length; i++) {
            if (dragPath[i] !== dropPath[i]) return true;
          }
          return false;
        }
        if (canDropExtra) {
          return canDropExtra(dragItem, item, dragPosition);
        }
        return true;
      },
      drop: (dragItem, monitor) => {
        if (monitor.didDrop()) return dragItem;
        onDrop?.(dragItem, item, dragPosition);
        return dragItem;
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    }),
    [item, dragPosition],
  );

  return {
    drag,
    drop,
    isDragging,
    isOver,
    canDrop,
    dragPosition,
    dropContainerRef,
  };
};
