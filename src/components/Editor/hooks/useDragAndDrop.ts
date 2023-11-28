import { useState } from "react";
import { Editor, Element, Path, Transforms } from "slate";
import { useDrag, useDrop } from "react-dnd";
import { ReactEditor, useSlate } from "slate-react";

interface IUseDragAndDropParams {
  element: Element;
}

const EDITOR_DRAG_TYPE = 'editor-item';

interface IDragItem {
  element: Element;
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
}


const useDragAndDrop = (params: IUseDragAndDropParams) => {
  const editor = useSlate();
  const { element } = params;

  const [isBefore, setIsBefore] = useState(false);

  const [{ isDragging, canDrag }, drag] = useDrag({
    type: EDITOR_DRAG_TYPE,
    item: {
      element,
    },
    canDrag: () => {
      const isBlock = Editor.isBlock(editor, element);
      return isBlock;
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
      canDrag: monitor.canDrag(),
    }),
  });

  const [{  canDrop, isOverCurrent }, drop] = useDrop<IDragItem, void, {
    isOverCurrent: boolean;
    canDrop: boolean;
  }>({
    accept: EDITOR_DRAG_TYPE,
    canDrop: (item) => {
      const dragPath = ReactEditor.findPath(editor, item.element);
      const dropPath = ReactEditor.findPath(editor, element);
      return !Path.equals(dragPath, dropPath) && editor.isBlock(item.element) && editor.isBlock(element);
    },
    collect: (monitor) => {
      return {
        isOverCurrent: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }
    },
    hover: (_item, monitor) => {
      if (!monitor.canDrop()) {
        return;
      }
      const monitorClientOffset = monitor.getClientOffset();
      if (!monitorClientOffset) {
        return;
      }
      const dropDOMNode = ReactEditor.toDOMNode(editor, element);
      const dropRect = dropDOMNode.getBoundingClientRect();
      const isBefore = monitorClientOffset.y - dropRect.top < dropRect.height / 2;
      setIsBefore(isBefore);
    },
    drop: (item, monitor) => {
      const didDrop = monitor.didDrop();
      if (didDrop) {
        return;
      }
      try {
        const dragElement = item.element;
        const dragPath = ReactEditor.findPath(editor, dragElement);

        const dropElement = element;
        const dropPath = ReactEditor.findPath(editor, dropElement);
        const dropDOMNode = ReactEditor.toDOMNode(editor, dropElement);
        const dropRect = dropDOMNode.getBoundingClientRect();
        // 如果在元素的上半部分，就插入到元素前面，否则插入到元素后面
        const monitorClientOffset = monitor.getClientOffset();
        if (!monitorClientOffset) {
          return;
        }
        const isBefore = monitorClientOffset.y - dropRect.top < dropRect.height / 2;

        moveNode(editor, dragPath, dropPath, isBefore);
      } catch (e) {
        console.error(e);
      }
    },
  });

  return {
    drag,
    drop,
    isDragging,
    isBefore,
    isOverCurrent,
    canDrop,
    canDrag,
  }
}

export default useDragAndDrop;
