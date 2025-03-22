import { useState, useCallback } from "react";
import { Editor, Element, Path, Transforms } from "slate";
import { useDrag, useDrop } from "react-dnd";
import { ReactEditor, useSlate, useReadOnly } from "slate-react";
import type { DropTargetMonitor } from "react-dnd";

interface IUseDragAndDropParams {
  element: Element;
  disableDrag?: boolean;
}

const EDITOR_DRAG_TYPE = "editor-item";

interface IDragItem {
  element: Element;
  editor: Editor;
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
  const editor = useSlate();
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
      const dragPath = ReactEditor.findPath(editor, item.element);
      const dropPath = ReactEditor.findPath(editor, element);
      const dragEditor = item.editor;
      let dropParent;
      try {
        dropParent = Editor.parent(editor, dropPath);
      } catch (e) {
        console.error(e);
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

      if (editor.isBlock(item.element) && editor.isBlock(element)) {
        return editor !== dragEditor || !Path.equals(dragPath, dropPath);
      } else {
        return false;
      }
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
        const dragEditor = item.editor;
        const dragElement = item.element;
        const dragPath = ReactEditor.findPath(dragEditor, dragElement);
        const dropPath = ReactEditor.findPath(editor, element);

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
      accept: EDITOR_DRAG_TYPE,
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
