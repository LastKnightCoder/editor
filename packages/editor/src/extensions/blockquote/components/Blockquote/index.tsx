import React, { PropsWithChildren, memo } from "react";
import { RenderElementProps, useSlate, useReadOnly } from "slate-react";
import classnames from "classnames";
import type { BlockquoteElement } from "../../../types";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { buildBlockquoteMenuItems } from "../../utils/menuItems";
import { MdDragIndicator } from "react-icons/md";
import { useNotifier } from "../../../../services/hooks";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import AddParagraph from "../../../../components/AddParagraph";

interface IBlockQuoteProps {
  attributes: RenderElementProps["attributes"];
  element: BlockquoteElement;
}

const DragHandler = memo(
  ({
    drag,
    onClick,
  }: {
    drag: React.Ref<HTMLDivElement>;
    onClick?: (e: React.MouseEvent) => void;
  }) => {
    return (
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(
          "absolute -left-[1.25em] top-[0.25em] flex h-[1.5em] w-[1em] cursor-grab items-center justify-center rounded opacity-0 transition-all group-hover:opacity-100"
        )}
        onClick={onClick}
      >
        <MdDragIndicator className="text-lg text-[var(--ed-text-tertiary)]" />
      </div>
    );
  }
);

DragHandler.displayName = "DragHandler";

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = props => {
  const { attributes, element, children } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const message = useNotifier();
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop } = useDragAndDrop({
    element,
  });
  const isLast = useIsLastElement(element);

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: params => buildBlockquoteMenuItems(params, message),
  });

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={classnames("group relative")}
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
        <DragHandler drag={drag} onClick={dragHandlerProps.onClick} />
        <EditorContextMenu {...menuProps} readonly={readOnly} />
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Blockquote;
