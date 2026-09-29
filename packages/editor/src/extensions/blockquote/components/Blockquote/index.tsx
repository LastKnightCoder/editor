import React, { PropsWithChildren } from "react";
import { RenderElementProps, useSlate, useReadOnly } from "slate-react";
import classnames from "classnames";
import type { BlockquoteElement } from "../../../types";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { BLOCK_DRAG_GROUP, DragHandle } from "../../../../components/BlockDrag";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import AddParagraph from "../../../../components/AddParagraph";

interface IBlockQuoteProps {
  attributes: RenderElementProps["attributes"];
  element: BlockquoteElement;
}

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = props => {
  const { attributes, element, children } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } = useDragAndDrop({
    element,
  });
  const isLast = useIsLastElement(element);

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({ element, editor });

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={classnames("relative", BLOCK_DRAG_GROUP)}
    >
      <div {...attributes} className="relative">
        <div
          className={classnames(
            "relative py-[0.75em] pl-[1.5em] italic leading-relaxed transition-colors duration-200",
            "text-[var(--ed-text-secondary)]",
            {
              "opacity-50": isDragging,
              "bg-blue-50 dark:bg-blue-900/20": isOverCurrent && canDrop,
              "border-t-2 border-blue-500": isOverCurrent && canDrop && isBefore,
              "border-b-2 border-blue-500": isOverCurrent && canDrop && !isBefore,
            }
          )}
        >
          <div
            contentEditable={false}
            className="absolute bottom-1 left-0 top-1 w-1 select-none rounded-full"
            style={{ backgroundColor: "var(--ed-accent)" }}
          />
          {children}
        </div>
        <DragHandle
          dragRef={drag}
          canDrag={canDrag}
          onClick={dragHandlerProps.onClick}
          className="top-[0.25em] h-[1.5em] w-[1em] cursor-grab rounded transition-all"
          iconClassName="translate-y-0 text-lg text-[var(--ed-text-tertiary)]"
        />
        <EditorContextMenu {...menuProps} readonly={readOnly} />
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Blockquote;
