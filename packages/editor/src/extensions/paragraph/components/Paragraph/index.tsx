import React, { useEffect, memo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { cn } from "@tau/ui";

import type { ParagraphElement } from "../../../types";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import {
  BLOCK_DRAG_GROUP,
  DragHandle,
  dimWhileDragging,
  dropLineClass,
} from "../../../../components/BlockDrag";

import { useMemoizedFn } from "ahooks";
import { findPathSafely } from "../../../../utils";

interface IParagraphProps {
  attributes: RenderElementProps["attributes"];
  element: ParagraphElement;
}

const Paragraph: React.FC<React.PropsWithChildren<IParagraphProps>> = memo(props => {
  const { children, attributes, element } = props;
  const { disableDrag } = element;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const path = findPathSafely(editor, element);
  const isLast = (() => {
    if (!path) {
      return false;
    }
    if (path.length === 1) {
      return path[0] === editor.children.length - 1;
    }
    try {
      const parent = Editor.parent(editor, path);
      if (parent) {
        return parent[0].children.length - 1 === path[path.length - 1];
      }
      return false;
    } catch (error) {
      return false;
    }
  })();
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } = useDragAndDrop({
    element,
    disableDrag,
  });

  // 菜单条目由扩展声明与内核默认菜单贡献（01 §5.4）
  const { menuProps, dragHandlerProps } = useDragHandlerMenu({ element, editor });

  const handleFocus = useMemoizedFn((start = true) => {
    return (e: any) => {
      const { detail } = e;
      if (!detail) return;
      const { focusElement } = detail;
      if (element === focusElement) {
        const path = findPathSafely(editor, element);
        if (!path) {
          return;
        }
        ReactEditor.focus(editor);
        if (start) {
          Transforms.select(editor, {
            anchor: Editor.start(editor, [...path, 0]),
            focus: Editor.start(editor, [...path, 0]),
          });
        } else {
          Transforms.select(editor, {
            anchor: Editor.end(editor, path),
            focus: Editor.end(editor, path),
          });
        }
      }
    };
  });

  useEffect(() => {
    const handleFocusStart = handleFocus(true);
    const handleFocusEnd = handleFocus(false);

    document.addEventListener("element-focus-start", handleFocusStart);
    document.addEventListener("element-focus-end", handleFocusEnd);

    return () => {
      document.removeEventListener("element-focus-start", handleFocusStart);
      document.removeEventListener("element-focus-end", handleFocusEnd);
    };
  }, [handleFocus]);

  const dropActive = isOverCurrent && canDrop;

  return (
    <div
      ref={node => {
        drop(node);
      }}
      // flow-root 建立 BFC，防止段落 margin 折叠出容器，悬停区域才包得住段落的下边距
      className={cn("relative flow-root", BLOCK_DRAG_GROUP)}
    >
      <p
        {...attributes}
        className={cn(
          "relative mb-[1.25em]",
          dimWhileDragging(isDragging || dropActive),
          dropLineClass(dropActive, isBefore),
          dropActive && (isBefore ? "before:-top-[0.25em]" : "after:-bottom-[0.125em]"),
          isLast && "mb-0!"
        )}
      >
        {children}
      </p>
      {!disableDrag && (
        <DragHandle
          dragRef={drag}
          canDrag={canDrag}
          onClick={dragHandlerProps.onClick}
          className="top-[0.0625em]"
        />
      )}
      <EditorContextMenu {...menuProps} readonly={readOnly} />
    </div>
  );
});

export default Paragraph;
