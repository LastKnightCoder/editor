import { useState, useCallback } from "react";
import { Editor, Element, Node, Path, Transforms } from "slate";
import { useDrag, useDrop } from "react-dnd";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import type { DropTargetMonitor } from "react-dnd";
import {
  calcWidthsAfterDelete,
  getColumnWidths,
  updateColumnWidths,
} from "../utils/multi-columns-layout";
import type {
  MultiColumnContainerElement,
  MultiColumnItemElement,
} from "../types";

interface IUseDragAndDropParams {
  element: Element;
  disableDrag?: boolean;
}

const EDITOR_DRAG_TYPE = "editor-item";
const COLUMN_ITEM_DRAG_TYPE = "multi-column-item-reorder";

interface IDragItem {
  element: Element;
  editor: Editor;
  isColumnDrag?: boolean;
  columnPath?: Path;
  containerPath?: Path;
  columnIndex?: number;
}

const moveNode = (
  editor: Editor,
  dragPath: Path,
  dropPath: Path,
  isBefore: boolean,
) => {
  // 如果 dropPath 是 dragPath 的子节点，不允许移动
  if (Path.isAncestor(dragPath, dropPath)) {
    return;
  }
  // 判断是否是同一级别的移动
  const dragParentPath = Path.parent(dragPath);
  const dropParentPath = Path.parent(dropPath);
  if (Path.equals(dragParentPath, dropParentPath)) {
    // dragPath 在 dropPath 前面
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
  } else {
    // 不在同一级别
    const isDragBeforeDrop = Path.isBefore(dragPath, dropPath);
    if (isDragBeforeDrop) {
      if (Path.common(dragPath, dropPath) !== dragParentPath) {
        // drag 嵌套，移动 drag 不会改变 drop 的 path
        Transforms.moveNodes(editor, {
          at: dragPath,
          to: isBefore ? dropPath : Path.next(dropPath),
          voids: true,
        });
      } else {
        // drop 在 common 那一层要前移
        const toDropPath = isBefore ? dropPath : Path.next(dropPath);
        toDropPath[dragParentPath.length] += 1;
        Transforms.moveNodes(editor, {
          at: dragPath,
          to: toDropPath,
        });
      }
    } else {
      // drag 在 drop 后面，不论怎么样， drop 的 path 都不会改变
      Transforms.moveNodes(editor, {
        at: dragPath,
        to: isBefore ? dropPath : Path.next(dropPath),
      });
    }
  }
};

const useDragAndDrop = (params: IUseDragAndDropParams) => {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { element, disableDrag = false } = params;

  const [isBefore, setIsBefore] = useState(false);

  // 使用 useCallback 优化 canDrag 函数
  const canDragFn = useCallback(() => {
    if (disableDrag) return false;
    return Editor.isBlock(editor, element) && !readOnly;
  }, [disableDrag, editor, element, readOnly]);

  // 拖拽相关部分
  const [{ isDragging, canDrag }, drag] = useDrag(
    {
      type: EDITOR_DRAG_TYPE,
      item: {
        element,
        editor,
      },
      canDrag: canDragFn,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
        canDrag: monitor.canDrag(),
      }),
    },
    [readOnly, element, disableDrag, canDragFn],
  );

  // 使用 useCallback 优化 canDrop 函数
  const canDropFn = useCallback(
    (item: IDragItem) => {
      if (readOnly) {
        return false;
      }
      const dropPath = ReactEditor.findPath(editor, element);
      const dragEditor = item.editor;
      let dropParent;
      if (dropPath.length > 1) {
        try {
          dropParent = Editor.parent(editor, dropPath);
        } catch (e) {
          console.error(e);
        }
      }

      // 如果当前元素是 check-list-item，拖动的元素不是 check-list-item，则不允许移动
      if (
        (element.type === "check-list-item" ||
          (element.type === "paragraph" &&
            dropParent?.[0].type === "check-list-item")) &&
        item.element.type !== "check-list-item"
      ) {
        return false;
      }

      if (item.isColumnDrag) {
        if (editor !== dragEditor) {
          return false;
        }
        if (!item.containerPath || !item.columnPath) {
          return false;
        }
        const isInsideContainer =
          Path.equals(item.containerPath, dropPath) ||
          Path.isAncestor(item.containerPath, dropPath);
        return !isInsideContainer;
      }

      const dragPath = ReactEditor.findPath(editor, item.element);
      if (editor.isBlock(item.element) && editor.isBlock(element)) {
        return editor !== dragEditor || !Path.equals(dragPath, dropPath);
      }
      return false;
    },
    [editor, element, readOnly],
  );

  // 使用 useCallback 优化 hover 函数
  const hoverFn = useCallback(
    (_item: IDragItem, monitor: DropTargetMonitor) => {
      if (!monitor.canDrop()) {
        return;
      }
      const monitorClientOffset = monitor.getClientOffset();
      if (!monitorClientOffset) {
        return;
      }
      const dropDOMNode = ReactEditor.toDOMNode(editor, element);
      const dropRect = dropDOMNode.getBoundingClientRect();
      const isBefore =
        monitorClientOffset.y - dropRect.top < dropRect.height / 2;
      setIsBefore(isBefore);
    },
    [editor, element],
  );

  // 使用 useCallback 优化 drop 函数
  const dropFn = useCallback(
    (item: IDragItem, monitor: DropTargetMonitor) => {
      const didDrop = monitor.didDrop();
      if (didDrop) {
        return;
      }
      try {
        const dropPath = ReactEditor.findPath(editor, element);

        if (item.isColumnDrag && item.columnPath && item.containerPath) {
          if (editor !== item.editor) {
            return;
          }
          if (
            Path.equals(item.containerPath, dropPath) ||
            Path.isAncestor(item.containerPath, dropPath)
          ) {
            return;
          }

          const columnPath = item.columnPath;
          const columnIndex =
            typeof item.columnIndex === "number"
              ? item.columnIndex
              : columnPath[columnPath.length - 1];

          const [columnNode] = Editor.node(editor, columnPath);
          const columnElement = columnNode as MultiColumnItemElement;
          const columnChildren = columnElement.children;

          const containerPathRef = Editor.pathRef(editor, item.containerPath);
          const dropPathRef = Editor.pathRef(editor, dropPath);

          Editor.withoutNormalizing(editor, () => {
            const currentContainerPath = containerPathRef.current;
            if (!currentContainerPath) {
              return;
            }
            const [containerNode] = Editor.node(editor, currentContainerPath);
            const container = containerNode as MultiColumnContainerElement;
            const currentWidths = getColumnWidths(container);
            const newWidths = calcWidthsAfterDelete(currentWidths, columnIndex);

            Transforms.removeNodes(editor, { at: columnPath });

            const currentDropPath = dropPathRef.current;
            if (currentDropPath) {
              const insertPath = isBefore
                ? currentDropPath
                : Path.next(currentDropPath);
              Transforms.insertNodes(editor, columnChildren, {
                at: insertPath,
              });
            }

            if (Node.has(editor, currentContainerPath)) {
              const [updatedContainer] = Editor.node(
                editor,
                currentContainerPath,
              );
              const updatedElement = updatedContainer as Element;
              if (updatedElement.children.length > 0) {
                updateColumnWidths(editor, currentContainerPath, newWidths);
              }
            }
          });

          containerPathRef.unref();
          dropPathRef.unref();
          return;
        }

        const dragEditor = item.editor;
        const dragElement = item.element;
        const dragPath = ReactEditor.findPath(dragEditor, dragElement);

        if (editor !== dragEditor) {
          Transforms.removeNodes(dragEditor, {
            at: dragPath,
          });
          Transforms.insertNodes(editor, dragElement, {
            at: isBefore ? dropPath : Path.next(dropPath),
          });
          return;
        }

        moveNode(editor, dragPath, dropPath, isBefore);
      } catch (e) {
        console.error(e);
      }
    },
    [editor, element, isBefore],
  );

  // 放置相关部分
  const [{ canDrop, isOverCurrent }, drop] = useDrop<
    IDragItem,
    void,
    {
      isOverCurrent: boolean;
      canDrop: boolean;
    }
  >(
    {
      accept: [EDITOR_DRAG_TYPE, COLUMN_ITEM_DRAG_TYPE],
      canDrop: canDropFn,
      collect: (monitor) => {
        return {
          isOverCurrent: monitor.isOver({ shallow: true }),
          canDrop: monitor.canDrop(),
        };
      },
      hover: hoverFn,
      drop: dropFn,
    },
    [readOnly, isBefore, element, canDropFn, hoverFn, dropFn],
  );

  return {
    drag,
    drop,
    isDragging,
    isBefore,
    isOverCurrent,
    canDrop,
    canDrag,
  };
};

export default useDragAndDrop;
