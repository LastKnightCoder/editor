import { useState, useCallback } from "react";
import { Editor, Path, Transforms, Element } from "slate";
import { useDrop, useDragLayer } from "react-dnd";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import type { DropTargetMonitor } from "react-dnd";
import type {
  MultiColumnItemElement,
  MultiColumnContainerElement,
} from "../../types";
import {
  getColumnWidths,
  calcWidthsAfterInsert,
  updateColumnWidths,
  MAX_COLUMNS,
} from "../../../utils/multi-columns-layout";

const EDITOR_DRAG_TYPE = "editor-item";

interface IDragItem {
  element: Element;
  editor: Editor;
}

interface IUseColumnEdgeDropParams {
  position: "left" | "right";
  columnIndex: number;
  containerPath: Path;
}

const useColumnEdgeDrop = (params: IUseColumnEdgeDropParams) => {
  const { position, columnIndex, containerPath } = params;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [isActive, setIsActive] = useState(false);
  const isDragging = useDragLayer((monitor) => {
    return monitor.isDragging() && monitor.getItemType() === EDITOR_DRAG_TYPE;
  });

  // 创建新列并插入元素
  const insertColumnWithElement = useCallback(
    (
      containerPath: Path,
      atIndex: number,
      dragElement: Element,
      dragEditor: Editor,
    ) => {
      try {
        // 获取容器和当前列宽
        const [containerNode] = Editor.node(editor, containerPath);
        const container = containerNode as MultiColumnContainerElement;
        const currentWidths = getColumnWidths(container);

        // 先检查是否可以插入新列（最大列数限制）
        const newWidths = calcWidthsAfterInsert(currentWidths, atIndex);
        if (!newWidths) {
          // 已达最大列数，不执行任何操作
          return;
        }

        // 获取拖拽元素的路径
        const dragPath = ReactEditor.findPath(dragEditor, dragElement);

        // 创建新列
        const newColumn: MultiColumnItemElement = {
          type: "multi-column-item",
          children: [dragElement as any],
        };

        // 如果是同一个编辑器，需要先删除再插入
        if (editor === dragEditor) {
          const containerPathRef = Editor.pathRef(editor, containerPath);
          Transforms.removeNodes(dragEditor, { at: dragPath });
          const currentContainerPath = containerPathRef.current;
          containerPathRef.unref();
          if (!currentContainerPath) {
            return;
          }
          Transforms.insertNodes(editor, newColumn, {
            at: [...currentContainerPath, atIndex],
          });
          updateColumnWidths(editor, currentContainerPath, newWidths);
        } else {
          // 跨编辑器：先删除，再插入
          Transforms.removeNodes(dragEditor, { at: dragPath });
          Transforms.insertNodes(editor, newColumn, {
            at: [...containerPath, atIndex],
          });
          updateColumnWidths(editor, containerPath, newWidths);
        }
      } catch (e) {
        console.error("Failed to insert column with element:", e);
      }
    },
    [editor],
  );

  const canDropFn = useCallback(
    (item: IDragItem) => {
      if (readOnly) return false;
      if (containerPath.length === 0) return false;

      try {
        const dragElement = item.element;

        // 不允许拖拽多列布局容器到边缘（会导致嵌套问题）
        if (dragElement.type === "multi-column-container") {
          return false;
        }

        // 不允许拖拽列本身
        if (dragElement.type === "multi-column-item") {
          return false;
        }

        // 检查是否已达最大列数
        const [containerNode] = Editor.node(editor, containerPath);
        const container = containerNode as MultiColumnContainerElement;
        if (container.children.length >= MAX_COLUMNS) {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    },
    [readOnly, containerPath, editor],
  );

  const hoverFn = useCallback(
    (_item: IDragItem, monitor: DropTargetMonitor) => {
      if (!monitor.canDrop()) {
        setIsActive(false);
        return;
      }
      setIsActive(monitor.isOver({ shallow: true }));
    },
    [],
  );

  const dropFn = useCallback(
    (item: IDragItem, monitor: DropTargetMonitor) => {
      const didDrop = monitor.didDrop();
      if (didDrop) return;

      if (!monitor.canDrop()) return;
      if (containerPath.length === 0) return;

      const dragEditor = item.editor;
      const dragElement = item.element;

      // 根据位置决定插入到哪里
      const insertIndex = position === "left" ? columnIndex : columnIndex + 1;

      insertColumnWithElement(
        containerPath,
        insertIndex,
        dragElement,
        dragEditor,
      );
      setIsActive(false);
    },
    [containerPath, columnIndex, position, insertColumnWithElement],
  );

  const [{ canDrop, isOverCurrent }, drop] = useDrop<
    IDragItem,
    void,
    {
      isOverCurrent: boolean;
      canDrop: boolean;
    }
  >(
    {
      accept: EDITOR_DRAG_TYPE,
      canDrop: canDropFn,
      collect: (monitor) => ({
        isOverCurrent: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
      hover: hoverFn,
      drop: dropFn,
    },
    [canDropFn, hoverFn, dropFn],
  );

  return {
    drop,
    isActive: isActive && canDrop,
    isOverCurrent,
    canDrop,
    isDragging,
  };
};

export default useColumnEdgeDrop;
