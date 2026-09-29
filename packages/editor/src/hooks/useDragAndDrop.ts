import { useState, useCallback, type RefCallback } from "react";
import { Editor, Element, Node, Path, Transforms } from "slate";
import { useDrag, useDrop } from "react-dnd";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import type { DropTargetMonitor } from "react-dnd";
import {
  calcWidthsAfterDelete,
  getColumnWidths,
  updateColumnWidths,
} from "../utils/multi-columns-layout";
import { findPathSafely, getNodeAtPathSafely } from "../utils/path";
import type { ElementDragSpec } from "../api/drag";
import type { MultiColumnContainerElement, MultiColumnItemElement } from "../types";

/**
 * 块级拖拽的内核实现（01 §5.4 拖拽声明化）：只给 BlockDragHost 用，
 * 可拖性由元素类型上的 drag 声明决定——self 沿祖先链查 children，放置沿祖先链查 accepts。
 */

interface IUseDragAndDropParams {
  element: Element;
  /** 本块的拖拽声明（装配聚合）；无声明就没有 chrome，不会进到这里 */
  dragSpec: ElementDragSpec;
  /** 全量声明表（查祖先链） */
  dragSpecs: ReadonlyMap<string, ElementDragSpec>;
}

const EDITOR_DRAG_TYPE = "editor-item";
const COLUMN_ITEM_DRAG_TYPE = "multi-column-item-reorder";

interface IDragItem {
  sourceEditor: Editor;
  dragPath: Path;
  dragElementSnapshot: Element;
  isColumnDrag?: boolean;
  columnPath?: Path;
  containerPath?: Path;
  columnIndex?: number;
}

const moveNode = (editor: Editor, dragPath: Path, dropPath: Path, isBefore: boolean) => {
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

/** 沿祖先链查 children: false——容器（如勾选项）声明子内容不参与拖拽时，更深的手柄都不显示 */
const ancestorsAllowChildren = (
  editor: Editor,
  dragSpecs: ReadonlyMap<string, ElementDragSpec>,
  path: Path
): boolean => {
  for (let current = Path.parent(path); current.length > 0; current = Path.parent(current)) {
    try {
      const ancestor = Node.get(editor, current) as Element;
      const spec = dragSpecs.get(ancestor.type);
      if (spec && !spec.children) return false;
    } catch {
      return false;
    }
  }
  return true;
};

/**
 * 沿祖先链查 accepts：drop 目标自己与所有声明了 accepts 的祖先都要接受拖动元素。
 * 「拖到容器内部的子块前后」意味着进入容器，所以祖先的 accepts 也作数（容器不必认识子块类型）。
 */
const ancestorsAccept = (
  editor: Editor,
  dragSpecs: ReadonlyMap<string, ElementDragSpec>,
  dropPath: Path,
  dragElement: Element
): boolean => {
  for (let current = dropPath; current.length > 0; current = Path.parent(current)) {
    try {
      const node = Node.get(editor, current) as Element;
      const spec = dragSpecs.get(node.type);
      if (spec?.accepts && !spec.accepts(dragElement)) return false;
    } catch {
      return false;
    }
  }
  return true;
};

const useDragAndDrop = (params: IUseDragAndDropParams) => {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { element, dragSpec, dragSpecs } = params;

  const [isBefore, setIsBefore] = useState(false);

  const getCurrentElementPath = useCallback(() => {
    return findPathSafely(editor, element);
  }, [editor, element]);

  // 使用 useCallback 优化 canDrag 函数
  const canDragFn = useCallback(() => {
    if (!dragSpec.self) return false;
    const path = getCurrentElementPath();
    if (!path) return false;
    return (
      ancestorsAllowChildren(editor, dragSpecs, path) &&
      Editor.isBlock(editor, element) &&
      !readOnly
    );
  }, [dragSpec, dragSpecs, editor, element, getCurrentElementPath, readOnly]);

  // 拖拽相关部分
  const [{ isDragging, canDrag }, dragConnector] = useDrag(
    {
      type: EDITOR_DRAG_TYPE,
      item: () => {
        const dragPath = getCurrentElementPath();
        if (!dragPath) {
          return null;
        }
        return {
          sourceEditor: editor,
          dragPath,
          dragElementSnapshot: Node.get(editor, dragPath) as Element,
        };
      },
      canDrag: canDragFn,
      collect: monitor => ({
        isDragging: monitor.isDragging(),
        canDrag: monitor.canDrag(),
      }),
    },
    [readOnly, element, canDragFn]
  );

  // 使用 useCallback 优化 canDrop 函数
  const canDropFn = useCallback(
    (item: IDragItem) => {
      if (readOnly) {
        return false;
      }
      const dropPath = getCurrentElementPath();
      if (!dropPath) {
        return false;
      }
      const dragEditor = item.sourceEditor;

      // 放置谓词沿祖先链求值（如勾选项只接受同类落进来）
      if (!ancestorsAccept(editor, dragSpecs, dropPath, item.dragElementSnapshot)) {
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

      const dragPath = item.dragPath;
      const dragElement = item.dragElementSnapshot;
      if (editor.isBlock(dragElement) && editor.isBlock(element)) {
        return editor !== dragEditor || !Path.equals(dragPath, dropPath);
      }
      return false;
    },
    [editor, element, dragSpecs, getCurrentElementPath, readOnly]
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
      let dropDOMNode;
      try {
        dropDOMNode = ReactEditor.toDOMNode(editor, element);
      } catch {
        return;
      }
      const dropRect = dropDOMNode.getBoundingClientRect();
      const isBefore = monitorClientOffset.y - dropRect.top < dropRect.height / 2;
      setIsBefore(isBefore);
    },
    [editor, element]
  );

  // 使用 useCallback 优化 drop 函数
  const dropFn = useCallback(
    (item: IDragItem, monitor: DropTargetMonitor) => {
      const didDrop = monitor.didDrop();
      if (didDrop) {
        return;
      }
      try {
        const dropPath = getCurrentElementPath();
        if (!dropPath) {
          return;
        }

        if (item.isColumnDrag && item.columnPath && item.containerPath) {
          if (editor !== item.sourceEditor) {
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
              const insertPath = isBefore ? currentDropPath : Path.next(currentDropPath);
              Transforms.insertNodes(editor, columnChildren, {
                at: insertPath,
              });
            }

            if (Node.has(editor, currentContainerPath)) {
              const [updatedContainer] = Editor.node(editor, currentContainerPath);
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

        const dragEditor = item.sourceEditor;
        const dragElement = item.dragElementSnapshot;
        const dragPathRef = Editor.pathRef(dragEditor, item.dragPath);
        const dragPath = dragPathRef.current;
        if (!dragPath || !Node.has(dragEditor, dragPath)) {
          dragPathRef.unref();
          return;
        }

        if (editor !== dragEditor) {
          const currentDragElement =
            (getNodeAtPathSafely(dragEditor, dragPath) as Element | undefined) ?? dragElement;
          Transforms.removeNodes(dragEditor, {
            at: dragPath,
          });
          dragPathRef.unref();
          Transforms.insertNodes(editor, currentDragElement, {
            at: isBefore ? dropPath : Path.next(dropPath),
          });
          return;
        }

        moveNode(editor, dragPath, dropPath, isBefore);
        dragPathRef.unref();
      } catch (e) {
        console.error(e);
      }
    },
    [editor, element, getCurrentElementPath, isBefore]
  );

  // 放置相关部分
  const [{ canDrop, isOverCurrent }, dropConnector] = useDrop<
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
      collect: monitor => {
        return {
          isOverCurrent: monitor.isOver({ shallow: true }),
          canDrop: monitor.canDrop(),
        };
      },
      hover: hoverFn,
      drop: dropFn,
    },
    [readOnly, isBefore, element, canDropFn, hoverFn, dropFn]
  );

  const drag = useCallback<RefCallback<HTMLDivElement>>(
    node => {
      dragConnector(node);
    },
    [dragConnector]
  );

  const drop = useCallback<RefCallback<HTMLDivElement>>(
    node => {
      dropConnector(node);
    },
    [dropConnector]
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
