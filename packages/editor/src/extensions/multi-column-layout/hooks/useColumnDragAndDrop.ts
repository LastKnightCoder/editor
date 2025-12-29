import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { useDrag, useDrop } from "react-dnd";
import type {
  MultiColumnItemElement,
  MultiColumnContainerElement,
} from "../../types";
import { useState } from "react";
import { Editor, Path, Transforms } from "slate";
import {
  getColumnWidths,
  calcWidthsAfterReorder,
  updateColumnWidths,
} from "../../../utils/multi-columns-layout";

const COLUMN_ITEM_DRAG_TYPE = "multi-column-item-reorder";

interface IUseColumnDragAndDrop {
  element: MultiColumnItemElement;
}

const useColumnDragAndDrop = (params: IUseColumnDragAndDrop) => {
  const { element } = params;
  const [isBefore, setIsBefore] = useState(false);
  const editor = useSlateStatic();
  const readOnly = useReadOnly();

  let columnPath: Path;
  let containerPath: Path;

  try {
    columnPath = ReactEditor.findPath(editor, element);
    containerPath = columnPath.slice(0, columnPath.length - 1);
  } catch {
    columnPath = [];
    containerPath = [];
  }

  const [{ isDragging, canDrag }, drag] = useDrag({
    type: COLUMN_ITEM_DRAG_TYPE,
    item: {
      element,
      columnPath,
      containerPath,
      columnIndex: columnPath[columnPath.length - 1],
      editor,
      isColumnDrag: true,
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
      canDrag: monitor.canDrag(),
    }),
    canDrag: () => {
      if (readOnly) return false;
      // 获取父容器，确保至少有2列才能拖拽
      try {
        const path = ReactEditor.findPath(editor, element);
        const parentPath = Path.parent(path);
        const [parentNode] = Editor.node(editor, parentPath);
        const container = parentNode as MultiColumnContainerElement;
        return container.children.length > 1;
      } catch {
        return false;
      }
    },
  });

  const [{ canDrop, isOverCurrent }, drop] = useDrop<
    {
      element: MultiColumnItemElement;
      columnPath: Path;
      containerPath: Path;
      editor: Editor;
    },
    void,
    {
      isOverCurrent: boolean;
      canDrop: boolean;
    }
  >({
    accept: COLUMN_ITEM_DRAG_TYPE,
    canDrop: (item) => {
      if (readOnly) return false;
      // 只允许同一个容器内的列之间拖拽
      const { containerPath: dragContainerPath } = item;
      return (
        item.editor === editor && Path.equals(containerPath, dragContainerPath)
      );
    },
    hover: (_item, monitor) => {
      if (!monitor.canDrop()) {
        return;
      }
      // 计算是否在当前元素的左半部分（水平方向）
      const hoverBoundingRect = monitor.getClientOffset();
      if (!hoverBoundingRect) {
        return;
      }
      try {
        const dropColumnNode = ReactEditor.toDOMNode(editor, element);
        const dropColumnRect = dropColumnNode.getBoundingClientRect();
        const isBefore =
          hoverBoundingRect.x - dropColumnRect.left < dropColumnRect.width / 2;
        setIsBefore(isBefore);
      } catch {
        setIsBefore(false);
      }
    },
    collect: (monitor) => ({
      isOverCurrent: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
    drop: (item, monitor) => {
      const didDrop = monitor.didDrop();
      if (didDrop) {
        return;
      }

      try {
        const dragPath = ReactEditor.findPath(editor, item.element);
        const dropPath = ReactEditor.findPath(editor, element);

        // 如果是同一个元素，不做任何操作
        if (Path.equals(dragPath, dropPath)) {
          return;
        }

        const fromIndex = dragPath[dragPath.length - 1];
        const dropIndex = dropPath[dropPath.length - 1];

        // 获取容器和当前列宽
        const [containerNode] = Editor.node(editor, containerPath);
        const container = containerNode as MultiColumnContainerElement;
        const currentWidths = getColumnWidths(container);

        // 计算目标索引
        let toIndex: number;
        if (Path.isBefore(dragPath, dropPath)) {
          toIndex = isBefore ? dropIndex - 1 : dropIndex;
          Transforms.moveNodes(editor, {
            at: dragPath,
            to: isBefore ? Path.previous(dropPath) : dropPath,
            voids: true,
          });
        } else {
          toIndex = isBefore ? dropIndex : dropIndex + 1;
          Transforms.moveNodes(editor, {
            at: dragPath,
            to: isBefore ? dropPath : Path.next(dropPath),
            voids: true,
          });
        }

        // 更新列宽（宽度跟随内容移动）
        const newWidths = calcWidthsAfterReorder(
          currentWidths,
          fromIndex,
          toIndex,
        );
        updateColumnWidths(editor, containerPath, newWidths);
      } catch (e) {
        console.error("Failed to reorder columns:", e);
      }
    },
  });

  return {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isOverCurrent,
    isBefore,
  };
};

export default useColumnDragAndDrop;
