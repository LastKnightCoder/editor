import React from "react";
import { useSlate, useReadOnly } from "slate-react";
import { cn } from "@tau/ui";

import { type DivideLineElement } from "../../../types";
import AddParagraph from "../../../../components/AddParagraph";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import {
  BLOCK_DRAG_GROUP,
  DragHandle,
  DropIndicator,
  dimWhileDragging,
} from "../../../../components/BlockDrag";

import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import type { ElementRenderProps } from "../../../../api";

const DivideLineElement: React.FC<ElementRenderProps<DivideLineElement>> = props => {
  const { attributes, children, element } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({ element, editor });

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={cn(
        "relative",
        BLOCK_DRAG_GROUP,
        dimWhileDragging(isDragging || (isOverCurrent && canDrop))
      )}
    >
      <DropIndicator active={isOverCurrent && canDrop} before={isBefore} />

      <div
        {...attributes}
        contentEditable={false}
        className="mx-auto my-[1.5em] h-[0.125em] w-[90%] bg-[var(--ed-bg-hover)]"
      >
        {children}
        <AddParagraph element={element} />
      </div>

      <DragHandle
        dragRef={node => {
          drag(node);
        }}
        canDrag={canDrag}
        onClick={dragHandlerProps.onClick}
        className="-left-5 -top-3 h-7 w-5 transition-opacity"
        iconClassName="text-(--ed-text)"
      />
      <EditorContextMenu {...menuProps} readonly={readOnly} />
    </div>
  );
};

export default DivideLineElement;
