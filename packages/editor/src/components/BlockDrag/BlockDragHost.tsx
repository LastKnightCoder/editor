import { type ReactNode } from "react";
import type { Element } from "slate";
import { useSlateStatic, useReadOnly } from "slate-react";
import { cn } from "@tau/ui";

import { useInheritedKit } from "../../kit/context";
import useDragAndDrop from "../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../EditorContextMenu";
import type { ElementDragSpec } from "../../api/drag";
import { BLOCK_DRAG_GROUP, DragHandle, DropIndicator, dimWhileDragging } from ".";

/**
 * 拖拽 chrome 的唯一渲染点（01 §5.4 拖拽声明化）：手柄、插入线、悬停标记（ed-block）、
 * 半透明与手柄菜单都由这里渲染，块组件只渲染内容。元素类型没有 drag 声明时原样透传，
 * 不添加任何 DOM——未声明拖拽的类型（行内元素、列表项等）与迁移前一样没有 chrome。
 */

function BlockDragHostInner({
  element,
  dragSpec,
  dragSpecs,
  children,
}: {
  element: Element;
  dragSpec: ElementDragSpec;
  dragSpecs: ReadonlyMap<string, ElementDragSpec>;
  children: ReactNode;
}) {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } = useDragAndDrop({
    element,
    dragSpec,
    dragSpecs,
  });
  const { menuProps, dragHandlerProps } = useDragHandlerMenu({ element, editor });

  const dropActive = isOverCurrent && canDrop;

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={cn("relative", BLOCK_DRAG_GROUP, dimWhileDragging(isDragging || dropActive))}
    >
      <DropIndicator active={dropActive} before={isBefore} />
      {children}
      {dragSpec.self && (
        <DragHandle
          dragRef={drag}
          canDrag={canDrag}
          onClick={dragHandlerProps.onClick}
          className={
            typeof dragSpec.handleClassName === "function"
              ? dragSpec.handleClassName(element)
              : dragSpec.handleClassName
          }
        />
      )}
      <EditorContextMenu {...menuProps} readonly={readOnly} />
    </div>
  );
}

export function BlockDragHost({ element, children }: { element: Element; children: ReactNode }) {
  const kit = useInheritedKit();
  const dragSpecs = kit?.assembly.dragSpecs;
  const dragSpec = dragSpecs?.get(element.type);
  if (!dragSpec || !dragSpecs) return <>{children}</>;
  return (
    <BlockDragHostInner element={element} dragSpec={dragSpec} dragSpecs={dragSpecs}>
      {children}
    </BlockDragHostInner>
  );
}
