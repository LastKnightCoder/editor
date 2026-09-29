import React, { PropsWithChildren } from "react";
import { ReactEditor, RenderElementProps, useSlateStatic } from "slate-react";
import { CustomCheckbox } from "@tau/shared";
import type { CheckListItemElement } from "../../../types";
import { Transforms } from "slate";
import { cn } from "@tau/ui";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useMemoizedFn } from "ahooks";
import {
  BLOCK_DRAG_GROUP,
  DragHandle,
  DropIndicator,
  dimWhileDragging,
} from "../../../../components/BlockDrag";

interface CheckListItemProps {
  attributes: RenderElementProps["attributes"];
  element: CheckListItemElement;
}

const CheckListItem: React.FC<PropsWithChildren<CheckListItemProps>> = props => {
  const { attributes, children, element } = props;
  const { checked } = element;

  const editor = useSlateStatic();

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });
  const dropActive = isOverCurrent && canDrop;

  const onClick = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { checked: !checked }, { at: path });
  });

  return (
    <div
      data-check-list-item
      ref={node => {
        drop(node);
      }}
      className={cn("relative", BLOCK_DRAG_GROUP, dimWhileDragging(isDragging || dropActive))}
    >
      <DropIndicator active={dropActive} before={isBefore} />
      <li {...attributes} className="relative flex items-start gap-[0.5em] leading-[1.8]">
        <CustomCheckbox className="mt-[0.25em]!" checked={checked} onChange={onClick} />
        <div className="flex-1">{children}</div>
      </li>
      <DragHandle
        dragRef={node => {
          drag(node);
        }}
        canDrag={canDrag}
        className="-left-[1.5em] top-[0.0625em]"
      />
    </div>
  );
};

export default CheckListItem;
