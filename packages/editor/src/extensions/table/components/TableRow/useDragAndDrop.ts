import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { useDrag, useDrop } from "react-dnd";
import type { TableRowElement } from "../../../types";
import { useState } from "react";
import { Editor, Node, Path, Transforms } from "slate";
import { findPathSafely } from "../../../../utils";

const TABLE_ROW_DRAG_TYPE = "editor-table-row";

interface IUseDragAndDrop {
  element: TableRowElement;
}

const useDragAndDrop = (params: IUseDragAndDrop) => {
  const { element } = params;
  const [isBefore, setIsBefore] = useState(false);
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const tableRowPath = findPathSafely(editor, element) ?? [];
  const tablePath = tableRowPath.slice(0, tableRowPath.length - 1);

  const [{ isDragging, canDrag }, drag] = useDrag({
    type: TABLE_ROW_DRAG_TYPE,
    item: () => {
      if (tableRowPath.length === 0) {
        return null;
      }
      return {
        dragPath: tableRowPath,
        dragElementSnapshot: Node.get(editor, tableRowPath) as TableRowElement,
        tablePath,
        sourceEditor: editor,
      };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
      canDrag: monitor.canDrag(),
    }),
    canDrag: () => {
      // 标题行不能拖拽
      return (
        tableRowPath.length > 0 &&
        tableRowPath[tableRowPath.length - 1] !== 0 &&
        !readOnly
      );
    },
  });

  const [{ canDrop, isOverCurrent }, drop] = useDrop<
    {
      dragElementSnapshot: TableRowElement;
      dragPath: Path;
      tablePath: Path;
      sourceEditor: Editor;
    },
    void,
    {
      isOverCurrent: boolean;
      canDrop: boolean;
    }
  >({
    accept: TABLE_ROW_DRAG_TYPE,
    canDrop: (item) => {
      const { tablePath: dragTablePath } = item;
      return (
        item.sourceEditor === editor &&
        Path.equals(tablePath, dragTablePath) &&
        !readOnly
      );
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
      const isBefore =
        hoverBoundingRect.y - dropRowRect.top < dropRowRect.height / 2;
      const dropPath = findPathSafely(editor, element);
      if (!dropPath) {
        setIsBefore(false);
        return;
      }
      setIsBefore(isBefore && dropPath[dropPath.length - 1] !== 0);
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
      const dragPath = item.dragPath;
      const dropPath = findPathSafely(editor, element);
      if (!dropPath || !Node.has(editor, dragPath)) {
        return;
      }
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

export default useDragAndDrop;
