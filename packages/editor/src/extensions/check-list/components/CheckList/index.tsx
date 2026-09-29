import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import type { CheckListElement } from "../../../types";
import { cn } from "@tau/ui";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { DropIndicator, dimWhileDragging } from "../../../../components/BlockDrag";

interface ICheckListProps {
  attributes: RenderElementProps["attributes"];
  element: CheckListElement;
}

const CheckList: React.FC<PropsWithChildren<ICheckListProps>> = props => {
  const { attributes, children, element } = props;

  const { drop, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={cn("relative", dimWhileDragging(isOverCurrent && canDrop))}
    >
      <DropIndicator active={isOverCurrent && canDrop} before={isBefore} />
      <ul className="m-0 ps-[0.75em] [&_[data-check-list-item]]:mb-[1.25em]" {...attributes}>
        {children}
      </ul>
    </div>
  );
};

export default CheckList;
