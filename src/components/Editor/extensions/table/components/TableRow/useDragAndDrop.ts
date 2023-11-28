import { ReactEditor, useSlate } from "slate-react";
import { useDrag, useDrop } from 'react-dnd';
import { TableRowElement } from "@/components/Editor/types";
import { useState } from "react";
import { Path, Transforms } from "slate";

const TABLE_ROW_DRAG_TYPE = 'editor-table-row';

interface IUseDragAndDrop {
  element: TableRowElement;
}

const useDragAndDrop = (params: IUseDragAndDrop) => {
  const { element } = params;
  const [isBefore, setIsBefore] = useState(false);
  const editor = useSlate();
  const tableRowPath = ReactEditor.findPath(editor, element);
  const tablePath = tableRowPath.slice(0, tableRowPath.length - 1);
  
  const [{ isDragging, canDrag }, drag] = useDrag({
    type: TABLE_ROW_DRAG_TYPE,
    item: {
      element,
      tableRowPath,
      tablePath,
    },
    collect: monitor => ({
      isDragging: monitor.isDragging(),
      canDrag: monitor.canDrag(),
    }),
    canDrag: () => {
      // 标题行不能拖拽
      return tableRowPath[tableRowPath.length - 1] !== 0;
    }
  });
  
  const [{ canDrop, isOverCurrent }, drop] = useDrop<{
    element: TableRowElement;
    tableRowPath: Path;
    tablePath: Path;
  }, void, {
    isOverCurrent: boolean;
    canDrop: boolean;
  }>({
    accept: TABLE_ROW_DRAG_TYPE,
    canDrop: (item) => {
      const { tablePath: dragTablePath } = item;
      return Path.equals(tablePath, dragTablePath);
    },
    hover: (_item, monitor) => {
      if (!monitor.canDrop()) {
        return;
      }
      // 计算是否在当前元素的上半部分
      const hoverBoundingRect = monitor.getClientOffset();
      if (!hoverBoundingRect) {
        return;
      }
      const dropRowNode = ReactEditor.toDOMNode(editor, element);
      const dropRowRect = dropRowNode.getBoundingClientRect();
      const isBefore = hoverBoundingRect.y - dropRowRect.top < dropRowRect.height / 2;
      const dropPath = ReactEditor.findPath(editor, element);
      setIsBefore(isBefore && dropPath[dropPath.length - 1] !== 0);
    },
    collect: monitor => ({
      isOverCurrent: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
    drop: (item, monitor) => {
      const didDrop = monitor.didDrop();
      if (didDrop) {
        return;
      }
      const dragPath = ReactEditor.findPath(editor, item.element);
      const dropPath = ReactEditor.findPath(editor, element);
      if (Path.isBefore(dragPath, dropPath)) {
        Transforms.moveNodes(editor, {
          at: dragPath,
          to: isBefore ? Path.previous(dropPath) : dropPath,
          voids: true,
        });
      } else {
        Transforms.moveNodes(editor, {
          at: dragPath,
          to: isBefore ? dropPath : Path.next(dropPath),
          voids: true,
        });
      }
    }
  });
  
  return {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isOverCurrent,
    isBefore,
  }
}

export default useDragAndDrop;